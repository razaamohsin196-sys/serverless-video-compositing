import { useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { UploadPanel } from './components/UploadPanel';
import { CornerEditor } from './components/CornerEditor';
import { PreviewPanel } from './components/PreviewPanel';
import { RenderPanel } from './components/RenderPanel';
import type { Corners } from './lib/types';

const AppContent = () => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [backgroundPath, setBackgroundPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [corners, setCorners] = useState<Corners | null>(null);

  const handleUploaded = (data: {
    jobId: string;
    videoPath: string;
    backgroundPath: string;
    videoUrl: string;
    backgroundUrl: string;
  }) => {
    setJobId(data.jobId);
    setVideoPath(data.videoPath);
    setBackgroundPath(data.backgroundPath);
    setVideoUrl(data.videoUrl);
    setBackgroundUrl(data.backgroundUrl);
  };

  return (
    <main className="app">
      <header className="hero">
        <div>
          <h1>Screen Mapper</h1>
          <p>
            Upload a video, pin the four screen corners, and generate a
            perspective-correct composite.
          </p>
        </div>
      </header>

      <div className="grid">
        <UploadPanel onUploaded={handleUploaded} />
        {backgroundUrl ? (
          <CornerEditor
            backgroundUrl={backgroundUrl}
            corners={corners}
            onChange={(next) => setCorners(next)}
          />
        ) : (
          <section className="panel empty">Upload a background to edit corners.</section>
        )}
        {backgroundUrl && videoUrl ? (
          <PreviewPanel
            backgroundUrl={backgroundUrl}
            videoUrl={videoUrl}
            corners={corners}
          />
        ) : (
          <section className="panel empty">Upload assets to preview the composite.</section>
        )}
        <RenderPanel
          jobId={jobId}
          videoPath={videoPath}
          backgroundPath={backgroundPath}
          corners={corners}
        />
      </div>
    </main>
  );
};

const App = () => (
  <Authenticator>
    <AppContent />
  </Authenticator>
);

export default App;
