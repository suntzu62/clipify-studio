import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

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
    const userId = auth.userId;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Rate limiting: 3 uploads per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentUploads, error: uploadsError } = await supabase
      .from('user_jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('source', 'upload')
      .gte('created_at', oneHourAgo);
    
    if (!uploadsError && recentUploads && recentUploads.length >= 3) {
      return new Response(
        JSON.stringify({ error: 'upload_rate_limit', message: 'Máximo de 3 uploads por hora atingido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('video') as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'no_file', message: 'Nenhum arquivo enviado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate file
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: 'file_too_large', message: 'Arquivo muito grande. Máximo: 5GB' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: 'invalid_type', message: 'Formato não suportado. Use: MP4, MOV, AVI, MKV' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Generate unique job ID and storage path
    const jobId = `upload-${Date.now()}-${crypto.randomUUID().split('-')[0]}`;
    const timestamp = Date.now();
    const storagePath = `uploads/${userId}/${timestamp}/${file.name}`;
    
    // Upload to storage bucket 'raw'
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('raw')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'upload_failed', message: uploadError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Create job record
    const { error: jobError } = await supabase
      .from('user_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        source: 'upload',
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        status: 'queued',
        created_at: new Date().toISOString(),
      });

    if (jobError) {
      console.error('Job creation error:', jobError);
      // Clean up uploaded file
      await supabase.storage.from('raw').remove([storagePath]);
      return new Response(
        JSON.stringify({ error: 'job_creation_failed', message: jobError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[upload-video] Created job ${jobId} for user ${userId}, file: ${file.name}`);

    return new Response(
      JSON.stringify({ 
        jobId,
        storagePath,
        fileName: file.name,
        fileSize: file.size,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload-video] Error:', message);
    return new Response(
      JSON.stringify({ error: 'internal_error', message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
