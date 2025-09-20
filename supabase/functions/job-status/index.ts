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
    console.error('[job-status] Auth failed:', auth.error);
    return new Response(JSON.stringify({ error: auth.error }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    console.log('[job-status] Processing request for job:', id);
    
    if (!id) {
      console.error('[job-status] Missing job ID');
      return new Response(JSON.stringify({ error: 'id required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const raw = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!raw || !apiKey) {
      console.error('[job-status] Workers API not configured');
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const base = raw.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const primaryUrl = `${base}/api/jobs/${id}/status`;
    console.log('[job-status] Fetching from primary URL:', primaryUrl);
    
    let resp = await fetch(primaryUrl, { headers: { 'x-api-key': apiKey } });

    if (resp.status === 404) {
      const altUrl = `${base}/jobs/${id}/status`;
      console.log('[job-status] Primary failed, trying alt URL:', altUrl);
      resp = await fetch(altUrl, { headers: { 'x-api-key': apiKey } });
    }

    console.log('[job-status] Workers API response status:', resp.status);
    const data = await resp.json().catch((err) => {
      console.error('[job-status] Failed to parse JSON from workers API:', err);
      return {};
    });

    console.log('[job-status] Workers API data keys:', Object.keys(data));
    console.log('[job-status] Job status from workers:', data.status || data.state);

    // Enhance response with clip metadata from storage
    const enhancedData = await enrichWithClipData(id, data);
    
    console.log('[job-status] Enhanced data keys:', Object.keys(enhancedData));
    console.log('[job-status] Enhanced clips count:', enhancedData.result?.clips?.length || 0);
    
    return new Response(JSON.stringify(enhancedData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: resp.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[job-status] Unhandled error:', message, err);
    return new Response(JSON.stringify({ 
      error: message,
      timestamp: new Date().toISOString(),
      debug: true
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});

async function enrichWithClipData(jobId: string, originalData: any) {
  try {
    console.log('[enrichWithClipData] Starting enrichment for job:', jobId);
    
    // Create admin Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[enrichWithClipData] Missing Supabase configuration');
      return normalizeJobData(originalData);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucket = 'raw'; // Use the correct bucket name
    
    console.log('[enrichWithClipData] Listing files from bucket:', bucket);
    
    // List files in clips and texts folders
    const { data: clipFiles, error: clipError } = await supabase.storage
      .from(bucket)
      .list(`projects/${jobId}/clips`, { limit: 1000 });
      
    const { data: textFolders, error: textError } = await supabase.storage
      .from(bucket)  
      .list(`projects/${jobId}/texts`, { limit: 1000 });

    console.log('[enrichWithClipData] Clip files result:', { 
      clipFiles: clipFiles?.length || 0, 
      clipError: clipError?.message 
    });
    console.log('[enrichWithClipData] Text folders result:', { 
      textFolders: textFolders?.length || 0, 
      textError: textError?.message 
    });

    if (clipError && textError) {
      console.error('[enrichWithClipData] Both storage queries failed:', { clipError, textError });
      return normalizeJobData(originalData);
    }

    // Process files to extract texts and clips
    const titles: string[] = [];
    const descriptions: string[] = [];
    const hashtags: string[] = [];
    const clips: any[] = [];

    // Group MP4 and JPG files by base name
    const fileGroups = new Map<string, { mp4?: any, jpg?: any }>();

    // Process clip files (videos and thumbnails)
    if (clipFiles && clipFiles.length > 0) {
      for (const file of clipFiles) {
        const fullPath = `projects/${jobId}/clips/${file.name}`;
        
        if (file.name.endsWith('.mp4')) {
          // Handle video files
          const baseName = file.name.replace('.mp4', '');
          if (!fileGroups.has(baseName)) {
            fileGroups.set(baseName, {});
          }
          fileGroups.get(baseName)!.mp4 = { ...file, fullPath };
        } else if (file.name.endsWith('.jpg')) {
          // Handle thumbnail
          const baseName = file.name.replace('.jpg', '');
          if (!fileGroups.has(baseName)) {
            fileGroups.set(baseName, {});
          }
          fileGroups.get(baseName)!.jpg = { ...file, fullPath };
        }
      }
    }

    // Process text folders to extract titles, descriptions, hashtags
    if (textFolders && textFolders.length > 0) {
      for (const folder of textFolders) {
        if (folder.name && folder.name !== '.emptyFolderPlaceholder') {
          // List files in each text subfolder
          const { data: textFiles } = await supabase.storage
            .from(bucket)
            .list(`projects/${jobId}/texts/${folder.name}`, { limit: 100 });
          
          if (textFiles) {
            for (const textFile of textFiles) {
              const fullPath = `projects/${jobId}/texts/${folder.name}/${textFile.name}`;
              
              if (textFile.name.endsWith('.txt') || textFile.name.endsWith('.md')) {
                // Read text files for titles, descriptions, hashtags
                const { data: textData } = await supabase.storage
                  .from(bucket)
                  .download(fullPath);
                  
                if (textData) {
                  const text = await textData.text();
                  const content = text.trim();
                  
                  if (textFile.name.includes('title')) {
                    if (content) titles.push(content);
                  } else if (textFile.name.includes('description')) {
                    if (content) descriptions.push(content);
                  } else if (textFile.name.includes('hashtag')) {
                    // Split hashtags by lines or spaces and clean them
                    const hashtagList = content
                      .split(/[\n\s,]+/)
                      .map(tag => tag.trim())
                      .filter(tag => tag.length > 0);
                    hashtags.push(...hashtagList);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Create clips from grouped files with signed URLs for private bucket
    let clipIndex = 0;
    for (const [baseName, group] of fileGroups) {
      if (group.mp4) {
        // Generate signed URLs for private bucket (valid for 7 days)
        const { data: previewSignedUrl } = await supabase.storage
          .from(bucket)
          .createSignedUrl(group.mp4.fullPath, 7 * 24 * 60 * 60); // 7 days

        const { data: downloadSignedUrl } = await supabase.storage
          .from(bucket)
          .createSignedUrl(group.mp4.fullPath, 7 * 24 * 60 * 60); // 7 days

        let thumbnailUrl = '';
        if (group.jpg) {
          const { data: thumbnailSignedUrl } = await supabase.storage
            .from(bucket)
            .createSignedUrl(group.jpg.fullPath, 7 * 24 * 60 * 60); // 7 days
          thumbnailUrl = thumbnailSignedUrl?.signedUrl || '';
        }

        clips.push({
          id: baseName,
          title: titles[clipIndex] || `Clipe ${clipIndex + 1}`,
          description: descriptions[clipIndex] || 'Descrição gerada automaticamente',
          hashtags: hashtags.slice(clipIndex * 3, (clipIndex + 1) * 3),
          previewUrl: previewSignedUrl?.signedUrl || '',
          downloadUrl: downloadSignedUrl?.signedUrl || '',
          thumbnailUrl: thumbnailUrl || undefined,
          duration: 60,
          status: 'ready'
        });
        clipIndex++;
      }
    }

    console.log('[enrichWithClipData] Final counts:', {
      titles: titles.length,
      descriptions: descriptions.length,
      hashtags: hashtags.length,
      clips: clips.length
    });

    const result = {
      ...normalizeJobData(originalData),
      result: {
        ...originalData.result,
        texts: {
          titles: titles.length > 0 ? titles : undefined,
          descriptions: descriptions.length > 0 ? descriptions : undefined,
          hashtags: hashtags.length > 0 ? hashtags : undefined
        },
        clips: clips.length > 0 ? clips : undefined
      },
      // Debug info for troubleshooting
      debug: {
        enriched: true,
        jobId,
        clipFilesFound: clipFiles?.length || 0,
        textFoldersFound: textFolders?.length || 0,
        clipGroupsProcessed: fileGroups.size,
        timestamp: new Date().toISOString()
      }
    };

    console.log('[enrichWithClipData] Successfully enriched data with', clips.length, 'clips');
    return result;
  } catch (err) {
    console.error('[enrichWithClipData] Error enriching data:', err);
    return {
      ...normalizeJobData(originalData),
      debug: {
        enriched: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString()
      }
    };
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
