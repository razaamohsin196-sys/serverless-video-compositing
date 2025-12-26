import { useState } from 'react';
import { getUrl, uploadData } from 'aws-amplify/storage';

type UploadPanelProps = {
  onUploaded: (data: {
    jobId: string;
    videoPath: string;
    backgroundPath: string;
    videoUrl: string;
    backgroundUrl: string;
  }) => void;
};

const getVideoDuration = (file: File) =>
  new Promise<number>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => reject(new Error('Failed to read video metadata'));
    video.src = URL.createObjectURL(file);
  });

export const UploadPanel = ({ onUploaded }: UploadPanelProps) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    setError(null);
    if (!videoFile || !backgroundFile) {
      setError('Upload both a video and a background image.');
      return;
    }

    const duration = await getVideoDuration(videoFile);
    if (duration > 10.5) {
      setError(`Video is too long (${duration.toFixed(2)}s). Limit is 10s.`);
      return;
    }

    setIsUploading(true);
    try {
      const jobId = crypto.randomUUID();
      const videoPath = `inputs/${jobId}/input.mp4`;
      const backgroundPath = `inputs/${jobId}/background${backgroundFile.name
        .slice(backgroundFile.name.lastIndexOf('.'))
        .toLowerCase()}`;

      await uploadData({
        path: videoPath,
        data: videoFile,
        options: { contentType: videoFile.type },
      }).result;

      await uploadData({
        path: backgroundPath,
        data: backgroundFile,
        options: { contentType: backgroundFile.type },
      }).result;

      const { url: videoUrl } = await getUrl({
        path: videoPath,
        options: { expiresIn: 3600 },
      });
      const { url: backgroundUrl } = await getUrl({
        path: backgroundPath,
        options: { expiresIn: 3600 },
      });

      onUploaded({
        jobId,
        videoPath,
        backgroundPath,
        videoUrl: videoUrl.toString(),
        backgroundUrl: backgroundUrl.toString(),
      });
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setError(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="panel">
      <h2>1) Upload assets</h2>
      <div className="field">
        <label>
          MP4 video (≤10s)
          <input
            type="file"
            accept="video/mp4"
            onChange={(event) =>
              setVideoFile(event.target.files?.[0] ?? null)
            }
          />
        </label>
      </div>
      <div className="field">
        <label>
          Background image
          <input
            type="file"
            accept="image/*"
            onChange={(event) =>
              setBackgroundFile(event.target.files?.[0] ?? null)
            }
          />
        </label>
      </div>
      <button className="primary" onClick={handleUpload} disabled={isUploading}>
        {isUploading ? 'Uploading…' : 'Upload files'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
};
