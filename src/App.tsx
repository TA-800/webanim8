import { useRef, useState } from "react";
import { fabric } from "fabric";

function App() {
  const mainFabRef = useRef<fabric.Canvas | null>(null);
  const onionFabRef = useRef<fabric.Canvas | null>(null);
  const bgFabRef = useRef<fabric.Canvas | null>(null);

  return (
    <div>
      <div>TIMELINE</div>
      <div>CANVASes</div>
      <div>PROPERTIES</div>
    </div>
  );
}

export default App;
