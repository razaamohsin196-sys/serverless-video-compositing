import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';
import { client } from '../lib/amplifyClient';
import type { Corners } from '../lib/types';

type RenderPanelProps = {
  jobId: string | null;
  videoPath: string | null;
  backgroundPath: string | null;
  corners: Corners | null;
};

type JobStatus = 'IDLE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export const RenderPanel = ({
  jobId,
  videoPath,
  backgroundPath,
  corners,
}: RenderPanelProps) => {
  const [activeJobId, setActiveJobId] = useState<string | null>(jobId);
  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setActiveJobId(jobId);
  }, [jobId]);

  useEffect(() => {
    if (
      !activeJobId ||
      status === 'IDLE' ||
      status === 'COMPLETED' ||
      status === 'FAILED'
    ) {
      return;
    }

    let isMounted = true;
    const poll = async () => {
      try {
        const { data } = await client.models.RenderJob.get({ id: activeJobId });
        if (!data || !isMounted) return;
        setStatus(data.status as JobStatus);
        setError(data.errorMessage ?? null);

        if (data.status === 'COMPLETED' && data.outputVideoPath) {
          const { url } = await getUrl({
            path: data.outputVideoPath,
            options: { expiresIn: 3600 },
          });
          if (isMounted) {
            setDownloadUrl(url.toString());
          }
        }
      } catch (pollError) {
        const message =
          pollError instanceof Error ? pollError.message : 'Poll failed';
        if (isMounted) {
          setError(message);
        }
      }
    };

    const interval = setInterval(poll, 3000);
    void poll();

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeJobId, status]);

  const startRender = async () => {
    setError(null);
    setDownloadUrl(null);
    if (!activeJobId || !videoPath || !backgroundPath || !corners) {
      setError('Missing upload or corner data.');
      return;
    }

    try {
      setStatus('PENDING');
      const { data } = await client.models.RenderJob.create({
        id: activeJobId,
        status: 'PENDING',
        inputVideoPath: videoPath,
        backgroundImagePath: backgroundPath,
        corners: JSON.stringify(corners),
      });

      const createdJobId = data?.id ?? activeJobId;
      setActiveJobId(createdJobId);

      await client.mutations.startRender({ jobId: createdJobId });
      setStatus('PROCESSING');
    } catch (startError) {
      const message =
        startError instanceof Error
          ? startError.message
          : 'Failed to start render';
      setError(message);
      setStatus('FAILED');
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;
    setError(null);
    setIsDownloading(true);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'rendered.mp4';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      const message =
        downloadError instanceof Error
          ? downloadError.message
          : 'Download failed';
      setError(message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section className="panel">
      <h2>4) Render video</h2>
      <button className="primary" onClick={startRender}>
        Start render
      </button>
      <div className="status-row">
        <span>Status:</span>
        <strong className={`status ${status.toLowerCase()}`}>{status}</strong>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {downloadUrl ? (
        <>
          <button
            className="download"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading…' : 'Download MP4'}
          </button>
          <a className="download" href={downloadUrl} target="_blank" rel="noreferrer">
            Open in browser
          </a>
        </>
      ) : null}
    </section>
  );
};
