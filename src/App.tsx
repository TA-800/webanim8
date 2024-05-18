import { useEffect, useRef, useState } from "react";
import { fabric } from "fabric";

function App() {
  // Fabric refs
  const mainFabRef = useRef<fabric.Canvas | null>(null);
  const onionFabRef = useRef<fabric.Canvas | null>(null);
  const bgFabRef = useRef<fabric.Canvas | null>(null);

  // Canvas references
  const mainCanvasRef = useRef(null);
  const onionCanvasRef = useRef(null);
  const bgCanvasRef = useRef(null);

  // frame rendering on current frame change
  // TODO

  // initialization
  useEffect(() => {
    mainFabRef.current = new fabric.Canvas(mainCanvasRef.current);
    onionFabRef.current = new fabric.Canvas(onionCanvasRef.current);
    bgFabRef.current = new fabric.Canvas(bgCanvasRef.current);

    return () => {
      mainFabRef.current?.dispose();
      onionFabRef.current?.dispose();
      bgFabRef.current?.dispose();
    };
  }, []);

  return (
    <div>
      <div>TIMELINE</div>
      <div className="grid grid-cols-1 grid-rows-1 w-[600px] h-[600px]">
        <canvas ref={bgCanvasRef} />
        <canvas ref={onionCanvasRef} />
        <canvas ref={mainCanvasRef} />
      </div>
      <div>PROPERTIES</div>
    </div>
  );
}

export default App;
