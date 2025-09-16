import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function requireAuth(req: Request) {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return { ok: false, res: new Response(JSON.stringify({ error: 'unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }) };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if ('error' in auth) {
    return new Response(JSON.stringify({ error: auth.error }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const raw = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!raw || !apiKey) {
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const base = raw.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const primaryUrl = `${base}/api/jobs/${id}/status`;
    console.log('[job-status] upstream primary:', primaryUrl);
    let resp = await fetch(primaryUrl, { headers: { 'x-api-key': apiKey } });

    if (resp.status === 404) {
      const altUrl = `${base}/jobs/${id}/status`;
      console.log('[job-status] primary 404, trying alt:', altUrl);
      resp = await fetch(altUrl, { headers: { 'x-api-key': apiKey } });
    }

    const data = await resp.json().catch(() => ({}));
    console.log('[job-status] upstream response:', data);

    // Enhance response with clip metadata from storage
    const enhancedData = await enrichWithClipData(id, data);
    
    return new Response(JSON.stringify(enhancedData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: resp.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[job-status] error:', message);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});

async function enrichWithClipData(jobId: string, originalData: any) {
  try {
    // Create admin Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('[job-status] Supabase not configured, returning original data');
      return normalizeJobData(originalData);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // List files in the raw bucket for this job
    const { data: files, error } = await supabase.storage
      .from('raw')
      .list(jobId, { limit: 100 });

    if (error) {
      console.error('[job-status] Storage list error:', error);
      return normalizeJobData(originalData);
    }

    console.log('[job-status] Found files:', files?.length || 0);

    // Extract clips and metadata
    const clips = [];
    const texts: { titles?: string[], descriptions?: string[], hashtags?: string[] } = {};
    
    if (files && files.length > 0) {
      // Group files by type
      const mp4Files = files.filter(f => f.name.endsWith('.mp4')).sort();
      const jpgFiles = files.filter(f => f.name.endsWith('.jpg')).sort();
      const textFiles = files.filter(f => f.name.includes('texts'));

      console.log('[job-status] MP4s:', mp4Files.length, 'JPGs:', jpgFiles.length, 'Texts:', textFiles.length);

      // Process text files to extract titles, descriptions, hashtags
      for (const textFile of textFiles) {
        try {
          const { data: textData } = await supabase.storage
            .from('raw')
            .download(`${jobId}/${textFile.name}`);
          
          if (textData) {
            const content = await textData.text();
            const parsed = JSON.parse(content);
            
            if (parsed.titles) texts.titles = parsed.titles;
            if (parsed.descriptions) texts.descriptions = parsed.descriptions;
            if (parsed.hashtags) texts.hashtags = parsed.hashtags;
          }
        } catch (err) {
          console.error('[job-status] Error parsing text file:', textFile.name, err);
        }
      }

      // Create clips from MP4 files
      for (let i = 0; i < mp4Files.length; i++) {
        const mp4File = mp4Files[i];
        const jpgFile = jpgFiles.find(j => j.name.includes(`clip-${i + 1}`) || j.name.includes(`${i + 1}`));
        
        // Generate public URLs for the files
        const { data: videoUrl } = supabase.storage
          .from('raw')
          .getPublicUrl(`${jobId}/${mp4File.name}`);
          
        const thumbnailUrl = jpgFile ? supabase.storage
          .from('raw')
          .getPublicUrl(`${jobId}/${jpgFile.name}`).data.publicUrl : undefined;

        clips.push({
          id: `clip-${i + 1}`,
          title: texts.titles?.[i] || `Clipe ${i + 1}`,
          description: texts.descriptions?.[i] || 'Descrição gerada automaticamente',
          hashtags: texts.hashtags?.slice(i * 3, (i + 1) * 3) || [],
          previewUrl: videoUrl.publicUrl,
          downloadUrl: videoUrl.publicUrl,
          thumbnailUrl,
          duration: 45,
          status: 'ready'
        });
      }
    }

    const result = {
      ...normalizeJobData(originalData),
      result: {
        ...originalData.result,
        texts,
        clips: clips.length > 0 ? clips : undefined
      }
    };

    console.log('[job-status] Enhanced with clips:', clips.length);
    return result;
  } catch (err) {
    console.error('[job-status] Error enriching data:', err);
    return normalizeJobData(originalData);
  }
}

function normalizeJobData(data: any) {
  // Normalize state -> status
  const status = data.state || data.status || 'queued';
  return {
    id: data.id || data.jobId,
    status: status,
    progress: data.progress || 0,
    currentStep: data.currentStep,
    error: data.error,
    result: data.result || {}
  };
}
