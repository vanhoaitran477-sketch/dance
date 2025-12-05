import React from 'react';
import BodyArtSketch from './components/BodyArtSketch';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Header / Instructions Overlay */}
      <div className="absolute top-4 left-0 right-0 z-20 pointer-events-none flex flex-col items-center justify-center text-white/80 transition-opacity duration-1000">
        <h1 className="text-2xl font-bold tracking-widest uppercase mb-2 drop-shadow-md">Body Art Echo</h1>
        <p className="text-xs font-light tracking-widest mb-4 opacity-70">(Tap screen to enable audio reaction)</p>
        <div className="flex gap-6 text-sm font-light tracking-wide bg-black/40 backdrop-blur-sm px-6 py-2 rounded-full border border-white/10">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            Plain Stand: Nested
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            Arms Side: Horizontal Split
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            Arms Up: Vertical Stack
          </span>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative w-full h-full">
         <BodyArtSketch />
      </div>
    </div>
  );
};

export default App;