import { useEffect, useRef, useState } from "react";
import { fabric } from "fabric";
import GIF from "gif.js";

function App() {
  // Fabric refs
  const mainFabRef = useRef<fabric.Canvas | null>(null);
  const onionFabRef = useRef<fabric.Canvas | null>(null);
  const bgFabRef = useRef<fabric.Canvas | null>(null);

  // Canvas references
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const onionCanvasRef = useRef(null);
  const bgCanvasRef = useRef(null);

  // animation states & properties
  const [selectedTool, setSelectedTool] = useState<"select" | "brush">("brush");

  const [fps, setFps] = useState(24);
  // TODO: use better type for frames
  const [frames, setFrames] = useState<any[]>([null]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isOnionSkinEnabled, _setIsOnionSkinEnabled] = useState(false);

  // animation is playing then interval id is stored here, else null
  const [animationIntervalId, setAnimationIntervalId] = useState<ReturnType<
    typeof setInterval
  > | null>(null);
  // 0 : not exporting, 1 : preparing to export, 2 : exporting
  const [isExportingGif, setIsExportingGif] = useState<0 | 1 | 2>(0);

  // common onion skin is-renderable conditions
  const onionToRender =
    // don't rely on isOnionSkinEnabled directly in this condition due to state snapshotting
    onionCanvasRef.current && // onion skin canvas is initialized
    currentFrame > 0 && // there is a previous frame to render
    frames[currentFrame - 1] !== null; // previous frame is not empty (unlikely)

  /**
   * HELPER FUNCTIONS
   */
  const saveFrameState = () => {
    setFrames((prev) => {
      const newFrames = [...prev];
      newFrames[currentFrame] = mainFabRef.current!.toJSON();
      return newFrames;
    });
  };

  const moveToFrame = (index: number) => {
    setCurrentFrame(index);
  };

  const addNewFrame = () => {
    // insert new frame after current frame
    setFrames((prev) => {
      const newFrames = [...prev];
      newFrames.splice(currentFrame + 1, 0, null);
      return newFrames;
    });

    moveToFrame(currentFrame + 1);
  };

  const duplicateFrame = () => {
    // insert new frame after current frame
    setFrames((prev) => {
      const newFrames = [...prev];
      newFrames.splice(currentFrame + 1, 0, mainFabRef.current!.toJSON());
      return newFrames;
    });

    moveToFrame(currentFrame + 1);
  };

  enum TimelineButton {
    NEW_KEYFRAME,
    DUP_KEYFRAME,
    PLAY,
    EXPORT,
    TIMELINE_KEYFRAME,
  }
  type TimelineButtonProps =
    | {
        button: Exclude<TimelineButton, TimelineButton.TIMELINE_KEYFRAME>;
      }
    | {
        button: TimelineButton.TIMELINE_KEYFRAME;
        index: number;
      };
  const selectTimelineButton = (props: TimelineButtonProps) => {
    saveFrameState();

    switch (props.button) {
      case TimelineButton.PLAY:
        playAnimation();
        break;
      case TimelineButton.NEW_KEYFRAME:
        addNewFrame();
        break;
      case TimelineButton.DUP_KEYFRAME:
        duplicateFrame();
        break;
      case TimelineButton.EXPORT:
        exportGif();
        break;
      case TimelineButton.TIMELINE_KEYFRAME:
        moveToFrame(props.index);
        break;
    }
  };

  enum ToolbarButton {
    // eraser -> todo
    SELECT,
    BRUSH,
    ERASER,
    CLEAR,
  }
  const selectToolbarButton = (button: ToolbarButton) => {
    saveFrameState();

    switch (button) {
      case ToolbarButton.SELECT:
        mainFabRef.current!.isDrawingMode = false;
        setSelectedTool("select");
        break;
      case ToolbarButton.BRUSH:
        setSelectedTool("brush");
        mainFabRef.current!.isDrawingMode = true;
        break;
      case ToolbarButton.ERASER:
        // TODO
        break;
      case ToolbarButton.CLEAR:
        clearCanvas();
        break;
    }
  };

  const clearCanvas = () => {
    // remove everything but background
    mainFabRef.current!.remove(...mainFabRef.current!.getObjects());
  };

  const renderOnionSkin = () => {
    // load JSON data into the fabric instance
    onionFabRef.current!.loadFromJSON(frames[currentFrame - 1], () => {
      // callback: on load complete, set each obj to 50% opacity and disable selection
      onionFabRef.current!.getObjects().forEach((obj) => {
        obj.set({ opacity: 0.5, selectable: false, evented: false });
      });
      // and then render the canvas with all (modified) objects loaded into fabric instance
      onionFabRef.current!.renderAll();
    });
  };

  const setIsOnionSkinEnabled = (checked: boolean) => {
    _setIsOnionSkinEnabled(checked);
    if (!checked) {
      // clear onion skin canvas
      onionFabRef.current!.clear();
    } else {
      // force a quick render when onion skin is turned on (checkbox)
      if (onionToRender) {
        renderOnionSkin();
      }
    }
  };

  const playAnimation = () => {
    if (frames.length <= 1) return;
    // Simply use setCurrentFrame to move to frame (frame is rendered on currentFrame change with useEffect)

    // if animation is playing when play button is clicked, stop the animation
    if (animationIntervalId) {
      clearInterval(animationIntervalId);
      setAnimationIntervalId(null);
      if (isOnionSkinEnabled && onionToRender) {
        renderOnionSkin();
      }
      return;
    }

    // else, start the animation
    onionFabRef.current!.clear();

    // play frames in loop
    const intervalId = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % frames.length);
    }, 1000 / fps);
    setAnimationIntervalId(intervalId);
  };

  /**
   * Gif Exporting
   */
  const exportGif = () => {
    // stop playing animation if it is playing
    if (frames.length <= 1) return;
    if (animationIntervalId) {
      selectTimelineButton({ button: TimelineButton.PLAY });
    }

    moveToFrame(frames.length - 1);
    // prepare to export (by first moving to last frame then setting isExportingGif to 1)
    setIsExportingGif(1);
  };

  useEffect(() => {
    if (isExportingGif !== 2) return;

    console.log("Exporting gif");

    // Instantiate gif.js
    const encoder = new GIF({
      workers: 2,
      quality: 10,
      workerScript: "node_modules/gif.js/dist/gif.worker.js",
    });

    // use new array to avoid background conflicts
    // create new deep copy of frames
    const exportFrames = frames.map((frame) =>
      JSON.parse(JSON.stringify(frame)),
    );

    exportFrames.forEach((frame) => {
      // set background (todo) = bgFabRef.current.background
      // if transparent, set to white
      let bg = bgFabRef.current!.backgroundColor;
      switch (bg) {
        case "":
        case null:
        case "transparent":
          bg = "white";
          break;
      }
      frame.background = bg;
    });

    // LOOP
    exportFrames.forEach((frame) => {
      clearCanvas();

      mainFabRef.current!.loadFromJSON(frame, () => {
        if (frame !== null) {
          mainFabRef.current!.renderAll();
        }
        encoder.addFrame(mainFabRef.current!.getElement(), {
          copy: true,
          delay: 1000 / fps,
        });
      });
    });
    // END LOOP

    encoder.on("finished", (blob) => {
      // download the gif
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "animation.gif";
      a.click();
      URL.revokeObjectURL(url);
    });

    encoder.render();

    // Reset isExportingGif to 0 after exporting
    mainFabRef.current!.loadFromJSON(frames[frames.length - 1], () => {
      // load original last frame back to canvas
      mainFabRef.current!.renderAll();
      setIsExportingGif(0);
    });
  }, [isExportingGif]);

  /**
   * Load drawing state from frames[currentFrame] to canvas
   * Render only with useEffect to avoid conflicts with React's async batch rendering
   */
  useEffect(() => {
    if (animationIntervalId === null && isOnionSkinEnabled && onionToRender) {
      renderOnionSkin();
    }
    // clear onion skin if there any above conditions are not met (extra check)
    // keep ? optional chaining here to avoid issues
    else if (!onionFabRef.current?.isEmpty()) {
      onionFabRef.current?.clear();
    }

    // Render current frame's drawing state
    if (!mainFabRef.current) return;

    // if current frame is null, clear canvas. Useful when adding new frame.
    // throws error "ctx is null" if isEmpty check not done before calling clear here
    if (!mainFabRef.current.isEmpty() && frames[currentFrame] === null) {
      clearCanvas();
    } else {
      // else, load drawing state from frames[currentFrame]
      mainFabRef.current.loadFromJSON(frames[currentFrame], () => {
        mainFabRef.current!.renderAll();
      });
    }
    if (isExportingGif === 1) {
      setIsExportingGif(2);
    }
  }, [currentFrame]);

  // initialization
  useEffect(() => {
    mainFabRef.current = new fabric.Canvas(mainCanvasRef.current);
    onionFabRef.current = new fabric.Canvas(onionCanvasRef.current);
    bgFabRef.current = new fabric.Canvas(bgCanvasRef.current);

    // set freedrawing mode during startup (sync with default selected tool state)
    mainFabRef.current.isDrawingMode = true;

    // initialize bg color to white
    bgFabRef.current.setBackgroundColor("white", () => {
      bgFabRef.current!.renderAll();
    });

    return () => {
      mainFabRef.current?.dispose();
      onionFabRef.current?.dispose();
      bgFabRef.current?.dispose();
    };
  }, []);

  return (
    /* MAIN WRAPPER */
    <div className="w-full h-full bg-gray-200">
      {/**
       * TIMELINE
       */}
      <div className="w-full flex flex-row flex-wrap gap-2 p-2 justify-center">
        <button
          title="Add frame"
          className="btn"
          onClick={() =>
            selectTimelineButton({ button: TimelineButton.NEW_KEYFRAME })
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path
              fillRule="evenodd"
              d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <button
          title="Duplicate Frame"
          className="btn"
          onClick={() =>
            selectTimelineButton({ button: TimelineButton.DUP_KEYFRAME })
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path d="M7.5 3.375c0-1.036.84-1.875 1.875-1.875h.375a3.75 3.75 0 0 1 3.75 3.75v1.875C13.5 8.161 14.34 9 15.375 9h1.875A3.75 3.75 0 0 1 21 12.75v3.375C21 17.16 20.16 18 19.125 18h-9.75A1.875 1.875 0 0 1 7.5 16.125V3.375Z" />
            <path d="M15 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 17.25 7.5h-1.875A.375.375 0 0 1 15 7.125V5.25ZM4.875 6H6v10.125A3.375 3.375 0 0 0 9.375 19.5H16.5v1.125c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 0 1 3 20.625V7.875C3 6.839 3.84 6 4.875 6Z" />
          </svg>
        </button>
        <button
          title={animationIntervalId !== null ? "Stop" : "Play"}
          className={`toggle ${animationIntervalId ? "toggle-active" : ""}`}
          onClick={() => selectTimelineButton({ button: TimelineButton.PLAY })}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path d="M15 6.75a.75.75 0 0 0-.75.75V18a.75.75 0 0 0 .75.75h.75a.75.75 0 0 0 .75-.75V7.5a.75.75 0 0 0-.75-.75H15ZM20.25 6.75a.75.75 0 0 0-.75.75V18c0 .414.336.75.75.75H21a.75.75 0 0 0 .75-.75V7.5a.75.75 0 0 0-.75-.75h-.75ZM5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v8.122c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L5.055 7.061Z" />
          </svg>
        </button>
        <button
          title="Export GIF"
          className="btn"
          onClick={() =>
            selectTimelineButton({ button: TimelineButton.EXPORT })
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path
              fillRule="evenodd"
              d="M9.75 6.75h-3a3 3 0 0 0-3 3v7.5a3 3 0 0 0 3 3h7.5a3 3 0 0 0 3-3v-7.5a3 3 0 0 0-3-3h-3V1.5a.75.75 0 0 0-1.5 0v5.25Zm0 0h1.5v5.69l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V6.75Z"
              clipRule="evenodd"
            />
            <path d="M7.151 21.75a2.999 2.999 0 0 0 2.599 1.5h7.5a3 3 0 0 0 3-3v-7.5c0-1.11-.603-2.08-1.5-2.599v7.099a4.5 4.5 0 0 1-4.5 4.5H7.151Z" />
          </svg>
        </button>
        {/* TIMELINE LIST */}
        {/* Force frame list to be on next flex line in entire wrapper, do this by taking full width*/}
        <div className="overflow-x-scroll w-full bg-gray-300 flex flex-row gap-2 p-2">
          {frames.map((_, index) => {
            return (
              <div
                key={index}
                onClick={() => {
                  selectTimelineButton({
                    button: TimelineButton.TIMELINE_KEYFRAME,
                    index: index,
                  });
                }}
                className={`h-7 min-w-7 flex justify-center cursor-pointer rounded-sm ${currentFrame === index ? "bg-blue-900 text-blue-300" : "bg-blue-300 text-blue-900"}`}
              >
                {index}
              </div>
            );
          })}
        </div>
      </div>

      {/**
       * MIDDLE WRAPPER
       */}
      <div className="w-full flex gap-2 mt-2 justify-center">
        {/**
         * CANVASES
         */}
        <div className="relative grid grid-cols-1 grid-rows-1 w-[600px] h-[600px]">
          {/* BACKGROUND CANVAS */}
          <div className="absolute top-0 left-0 out">
            <canvas width={600} height={600} ref={bgCanvasRef} />
          </div>
          {/* ONION CANVAS */}
          <div className="absolute top-0 left-0 out">
            <canvas width={600} height={600} ref={onionCanvasRef} />
          </div>
          {/* MAIN CANVAS */}
          <div className="absolute top-0 left-0 out">
            <canvas width={600} height={600} ref={mainCanvasRef} />
          </div>
        </div>

        {/**
         * TOOLBAR
         */}
        <div className="h-full w-24 flex flex-col items-center gap-2 p-2">
          <button
            title="Select"
            className={`toggle ${selectedTool === "select" ? "toggle-active" : ""}`}
            onClick={() => {
              selectToolbarButton(ToolbarButton.SELECT);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6"
            >
              <path
                fillRule="evenodd"
                d="M12 1.5a.75.75 0 0 1 .75.75V4.5a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 12 1.5ZM5.636 4.136a.75.75 0 0 1 1.06 0l1.592 1.591a.75.75 0 0 1-1.061 1.06l-1.591-1.59a.75.75 0 0 1 0-1.061Zm12.728 0a.75.75 0 0 1 0 1.06l-1.591 1.592a.75.75 0 0 1-1.06-1.061l1.59-1.591a.75.75 0 0 1 1.061 0Zm-6.816 4.496a.75.75 0 0 1 .82.311l5.228 7.917a.75.75 0 0 1-.777 1.148l-2.097-.43 1.045 3.9a.75.75 0 0 1-1.45.388l-1.044-3.899-1.601 1.42a.75.75 0 0 1-1.247-.606l.569-9.47a.75.75 0 0 1 .554-.68ZM3 10.5a.75.75 0 0 1 .75-.75H6a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10.5Zm14.25 0a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 0 1.5H18a.75.75 0 0 1-.75-.75Zm-8.962 3.712a.75.75 0 0 1 0 1.061l-1.591 1.591a.75.75 0 1 1-1.061-1.06l1.591-1.592a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <button
            title="Brush"
            className={`toggle ${selectedTool === "brush" ? "toggle-active" : ""}`}
            onClick={() => selectToolbarButton(ToolbarButton.BRUSH)}
          >
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

          <button
            title="Clear"
            className="btn"
            onClick={() => selectToolbarButton(ToolbarButton.CLEAR)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6"
            >
              <path
                fillRule="evenodd"
                d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        {/**
         * PROPERTIES PANEL
         */}
        <div className="h-full">
          {selectedTool === "select" && (
            <div className="propsPanel">
              <div className="flex flex-row gap-2 items-center">
                <label>Background</label>
                <input
                  type="color"
                  onChange={(e) => {
                    bgFabRef.current!.setBackgroundColor(e.target.value, () => {
                      bgFabRef.current!.renderAll();
                    });
                  }}
                />
              </div>
              <div className="flex flex-row gap-2 items-center">
                <label>Frame Rate</label>
                <input
                  type="number"
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value))}
                />
              </div>
              <div className="flex flex-row gap-2 items-center">
                <label>Onion Skin</label>
                <input
                  type="checkbox"
                  onChange={(e) => {
                    setIsOnionSkinEnabled(e.target.checked);
                  }}
                />
              </div>
            </div>
          )}
          {selectedTool === "brush" && (
            <div className="propsPanel">
              <div className="flex flex-row gap-2 items-center">
                <label>Size</label>
                <input
                  type="range"
                  defaultValue={1}
                  min={1}
                  max={50}
                  step={1}
                  onChange={(e) => {
                    mainFabRef.current!.freeDrawingBrush.width = parseInt(
                      e.target.value,
                    );
                  }}
                />
              </div>
              <div className="flex flex-row gap-2 items-center">
                <label>Color</label>
                <input type="color" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
