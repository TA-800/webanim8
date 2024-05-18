import { useEffect, useRef, useState } from "react";
import { fabric } from "fabric";

function App() {
  // Fabric refs
  const mainFabRef = useRef<fabric.Canvas | null>(null);
  const onionFabRef = useRef<fabric.Canvas | null>(null);
  const bgFabRef = useRef<fabric.Canvas | null>(null);

  // Canvas references
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  return (
    <div>
      <div>TIMELINE</div>
      <div>CANVASes</div>
      <div>PROPERTIES</div>
    </div>
  );
}

export default App;
