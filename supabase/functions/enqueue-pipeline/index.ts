import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Schema de validação para URLs do YouTube
const youtubeUrlSchema = z.string()
  .url({ message: 'URL inválida' })
  .max(2048, { message: 'URL muito longa (máximo 2048 caracteres)' })
  .refine(
    (url) => {
      const normalized = url.toLowerCase();
      return normalized.includes('youtube.com') || 
             normalized.includes('youtu.be') ||
             normalized.includes('m.youtube.com');
    },
    { message: 'URL deve ser do YouTube (youtube.com ou youtu.be)' }
  );

function normalizeYoutubeUrl(raw: string): string {
  const trimmed = raw.trim();
  const idMatch = trimmed.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
  if (idMatch) return `https://www.youtube.com/watch?v=${idMatch[1]}`;
  return trimmed;
}

async function generateJobId(sourceIdentifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(sourceIdentifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `job_${hashHex.substring(0, 16)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if ('error' in auth) {
    return new Response(JSON.stringify({ error: auth.error }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: auth.status 
    });
  }

  try {
    const body = await req.json();
    const userId = auth.userId;
    
    let source: any;
    if (body.youtubeUrl) {
      // Validar URL com zod
      const urlValidation = youtubeUrlSchema.safeParse(body.youtubeUrl);
      if (!urlValidation.success) {
        const errors = urlValidation.error.errors.map(e => e.message).join(', ');
        console.error('[enqueue-pipeline] URL validation failed:', {
          url: body.youtubeUrl,
          errors: urlValidation.error.errors
        });
        
        return new Response(
          JSON.stringify({ 
            error: 'invalid_youtube_url',
            message: `URL inválida: ${errors}`,
            details: urlValidation.error.errors
          }), 
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 400 
          }
        );
      }
      
      // Validar outros parâmetros
      if (body.neededMinutes && (typeof body.neededMinutes !== 'number' || body.neededMinutes < 1 || body.neededMinutes > 180)) {
        return new Response(
          JSON.stringify({ 
            error: 'invalid_needed_minutes',
            message: 'neededMinutes deve ser um número entre 1 e 180'
          }), 
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 400 
          }
        );
      }

      if (body.targetDuration && !['15', '30', '60', '90'].includes(String(body.targetDuration))) {
        return new Response(
          JSON.stringify({ 
            error: 'invalid_target_duration',
            message: 'targetDuration deve ser 15, 30, 60 ou 90'
          }), 
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 400 
          }
        );
      }
      
      source = { type: 'youtube', youtubeUrl: normalizeYoutubeUrl(body.youtubeUrl) };
    } else if (body.storagePath || body.upload) {
      const uploadData = body.upload || {};
      source = {
        type: 'upload',
        storagePath: body.storagePath || uploadData.objectKey,
        fileName: body.fileName || uploadData.originalName,
        bucket: uploadData.bucket || 'raw'
      };
    } else {
      return new Response(JSON.stringify({ error: 'invalid_source' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 
      });
    }
    
    const sourceIdentifier = source.type === 'youtube' ? source.youtubeUrl! : `${source.bucket}/${source.storagePath}`;
    const rootId = await generateJobId(sourceIdentifier);
    
    const jobData = {
      rootId,
      source,
      meta: {
        userId,
        targetDuration: body.targetDuration || body.meta?.targetDuration,
        neededMinutes: body.neededMinutes || 0,
        createdAt: new Date().toISOString()
      }
    };
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentJobs } = await supabase.from('user_jobs').select('id').eq('user_id', userId).gte('created_at', oneHourAgo);
    
    if (recentJobs && recentJobs.length >= 10) {
      return new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 
      });
    }
    
    await supabase.from('user_jobs').insert({
      id: rootId, user_id: userId, status: 'queued', progress: 0,
      youtube_url: source.type === 'youtube' ? source.youtubeUrl : null,
      storage_path: source.type === 'upload' ? source.storagePath : null,
      file_name: source.type === 'upload' ? source.fileName : null,
      source: source.type
    });
    
    const workersApiUrl = Deno.env.get('WORKERS_API_URL');
    if (!workersApiUrl) {
      console.error('[enqueue-pipeline] WORKERS_API_URL not configured');
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
      });
    }
    
    const workersApiKey = Deno.env.get('WORKERS_API_KEY');
    if (!workersApiKey) {
      console.error('[enqueue-pipeline] WORKERS_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'workers_api_key_not_configured' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
      });
    }
    
    console.log('[enqueue-pipeline] Using Workers API:', workersApiUrl);
    
    const response = await fetch(`${workersApiUrl}/api/jobs/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': workersApiKey },
      body: JSON.stringify(jobData)
    });
    
    if (!response.ok) throw new Error(`Workers API error: ${response.status}`);
    
    return new Response(JSON.stringify({ jobId: rootId, source: source.type }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 
    });
    
  } catch (error: any) {
    console.error('[enqueue-pipeline] Error:', error);
    return new Response(JSON.stringify({ error: 'internal_error', message: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
    });
  }
});
