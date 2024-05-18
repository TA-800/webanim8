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

  // animation states & properties
  const [selectedTool, setSelectedTool] = useState<"select" | "brush">("brush");

  const [fps, setFps] = useState(24);
  const [frames, setFrames] = useState<any[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);

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
    /* MAIN WRAPPER, make grid to center the content */
    <div className="grid grid-cols-1 grid-rows-1 w-full h-full place-items-center outline outline-blue-500">
      <div>TIMELINE</div>
      <div className="relative grid grid-cols-1 grid-rows-1 w-[600px] h-[600px]">
        {/* BACKGROUND CANVAS */}
        <div className="absolute top-0 left-0 outline outline-black">
          <canvas width={600} height={600} ref={bgCanvasRef} />
        </div>
        {/* ONION CANVAS */}
        <div className="absolute top-0 left-0 outline outline-black">
          <canvas width={600} height={600} ref={onionCanvasRef} />
        </div>
        {/* MAIN CANVAS */}
        <div className="absolute top-0 left-0 outline outline-black">
          <canvas width={600} height={600} ref={mainCanvasRef} />
        </div>
      </div>
      <div className="flex flex-row gap-2 p-2 outline outline-black">
        <button className="btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path
              fillRule="evenodd"
              d="M20.599 1.5c-.376 0-.743.111-1.055.32l-5.08 3.385a18.747 18.747 0 0 0-3.471 2.987 10.04 10.04 0 0 1 4.815 4.815 18.748 18.748 0 0 0 2.987-3.472l3.386-5.079A1.902 1.902 0 0 0 20.599 1.5Zm-8.3 14.025a18.76 18.76 0 0 0 1.896-1.207 8.026 8.026 0 0 0-4.513-4.513A18.75 18.75 0 0 0 8.475 11.7l-.278.5a5.26 5.26 0 0 1 3.601 3.602l.502-.278ZM6.75 13.5A3.75 3.75 0 0 0 3 17.25a1.5 1.5 0 0 1-1.601 1.497.75.75 0 0 0-.7 1.123 5.25 5.25 0 0 0 9.8-2.62 3.75 3.75 0 0 0-3.75-3.75Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div>PROPERTIES</div>
    </div>
  );
}

export default App;
