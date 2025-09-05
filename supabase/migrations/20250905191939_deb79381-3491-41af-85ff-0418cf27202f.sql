-- Create storage bucket for raw video files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('raw', 'raw', false);

-- Create RLS policies for raw bucket
CREATE POLICY "Service role can manage raw files" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'raw' AND auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read own raw files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'raw' AND (storage.foldername(name))[1] = 'projects');