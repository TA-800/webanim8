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
  // Input references
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs to buttons for shortcuts (simply call ref.current.click() to invoke click event)
  const addKeyframeButtonRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);

  // animation states & properties
  const [selectedTool, setSelectedTool] = useState<"select" | "brush">("brush");

  const [fps, setFps] = useState(24);
  // TODO: use better type for frames
  const [frames, setFrames] = useState<any[]>([null]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isOnionSkinEnabled, _setIsOnionSkinEnabled] = useState(false);

  // undo stack
  const undoStack = useRef<any[]>([]);

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
    // clear undo stack on frame change
    undoStack.current = [];

    // save current frame state
    setCurrentFrame(index);
  };

  const removeCurrentFrame = () => {
    if (frames.length <= 1) return;
    if (animationIntervalId !== null) return;
    moveToFrame(currentFrame - 1);
    setFrames((prev) => {
      const newFrames = [...prev];
      // remove the frame that we just moved back from
      newFrames.splice(currentFrame, 1);
      return newFrames;
    });
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
    REMOVE_KEYFRAME,
    DUP_KEYFRAME,
    PLAY,
    EXPORT,
    SAVE,
    IMPORT,
    TIMELINE_KEYFRAME,
  }
  type TimelineButtonProps =
    | {
        // exclude keyframe and import because they require additional data
        button: Exclude<
          TimelineButton,
          TimelineButton.TIMELINE_KEYFRAME | TimelineButton.IMPORT
        >;
      }
    | {
        button: TimelineButton.TIMELINE_KEYFRAME;
        index: number;
      }
    | {
        button: TimelineButton.IMPORT;
        file: File;
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
      case TimelineButton.REMOVE_KEYFRAME:
        removeCurrentFrame();
        break;
      case TimelineButton.DUP_KEYFRAME:
        duplicateFrame();
        break;
      case TimelineButton.EXPORT:
        exportGif();
        break;
      case TimelineButton.SAVE:
        saveProject();
        break;
      case TimelineButton.IMPORT:
        importProject(props.file);
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
    RECT,
    CIRCLE,
    LINE,
    UNDO,
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
      case ToolbarButton.RECT:
        const rect = new fabric.Rect({
          width: 50,
          height: 50,
          left: 300,
          top: 300,
          fill: mainFabRef.current!.freeDrawingBrush.color,
          stroke: "black",
          strokeWidth: mainFabRef.current!.freeDrawingBrush.width,
        });
        mainFabRef.current!.add(rect);
        break;
      case ToolbarButton.CIRCLE:
        const circle = new fabric.Circle({
          radius: 25,
          left: 300,
          top: 300,
          fill: mainFabRef.current!.freeDrawingBrush.color,
          stroke: "black",
          strokeWidth: mainFabRef.current!.freeDrawingBrush.width,
        });
        mainFabRef.current!.add(circle);
        break;
      case ToolbarButton.LINE:
        const line = new fabric.Line([50, 50, 200, 200], {
          stroke: mainFabRef.current!.freeDrawingBrush.color,
          strokeWidth: mainFabRef.current!.freeDrawingBrush.width,
        });
        mainFabRef.current!.add(line);
        break;
      case ToolbarButton.UNDO:
        undo();
        break;
      case ToolbarButton.CLEAR:
        clearCanvas();
        break;
    }
  };

  // javascript methods: shift, pop (to remove), unshift, push (to add)
  const pushOntoUndoStack = () => {
    console.log(
      "saving state onto undo stack, length b4 pushing: ",
      undoStack.current.length,
    );
    if (undoStack.current.length >= 11) {
      undoStack.current.shift(); // remove first element
    }

    undoStack.current.push(mainFabRef.current!.toJSON());
  };

  const undo = () => {
    if (undoStack.current.length === 1) return;

    console.log("undoing, new length will be: ", undoStack.current.length - 1);

    // turn off event listeners to prevent pushing undo state onto stack
    turnOffUndoListeners();

    undoStack.current.pop();
    mainFabRef.current!.loadFromJSON(
      undoStack.current[undoStack.current.length - 1],
      () => {
        mainFabRef.current!.renderAll();

        // re-enable event listeners
        turnOnUndoListeners();
      },
    );
  };

  const clearCanvas = () => {
    // remove everything but background
    mainFabRef.current!.remove(...mainFabRef.current!.getObjects());
    // save state onto undo stack
    pushOntoUndoStack();
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

      // re-enable event listeners
      turnOnUndoListeners();

      return;
    }

    // turn off event listeners to prevent pushing undo state onto stack
    turnOffUndoListeners();

    // else, start the animation
    onionFabRef.current!.clear();

    // play frames in loop
    const intervalId = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % frames.length);
    }, 1000 / fps);
    setAnimationIntervalId(intervalId);
  };

  /**
   * Save Project to user device
   */
  const saveProject = () => {
    // save drawing state on each frame to some json/txt file
    const data = JSON.stringify(frames);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "project.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProject = (file: File) => {
    console.log("loading project");

    if (!file) return;

    if (
      !window.confirm(
        "Loading a new project will remove the current project. Are you sure?",
      )
    ) {
      return;
    }

    // disable event listeners to prevent pushing undo state onto stack
    turnOffUndoListeners();

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        // parse JSON data
        const data = JSON.parse(e.target!.result as string);

        // clear undo stack
        undoStack.current = [];

        // load frames
        setFrames(data);

        // move to first frame to render canvas
        moveToFrame(0);

        // if we happened to be on the first frame, manually render canvas
        if (currentFrame === 0) {
          mainFabRef.current!.loadFromJSON(data[0], () => {
            mainFabRef.current!.renderAll();
          });
        }
      } catch (e) {
        alert(
          "Something went wrong while parsing project. Please try again.\nError: " +
            e,
        );
      }
    };

    reader.readAsText(file);

    // re-enable event listeners
    turnOnUndoListeners();
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "a") {
      addKeyframeButtonRef.current?.click();
    } else if (e.key === "z") {
      undoButtonRef.current?.click();
    }
  };

  const turnOnUndoListeners = () => {
    // event listeners for undo on main canvas (modified, added)
    mainFabRef.current!.on("object:modified", pushOntoUndoStack);
    mainFabRef.current!.on("object:added", pushOntoUndoStack);
  };
  const turnOffUndoListeners = () => {
    // turn off event listeners to prevent pushing undo state onto stack
    mainFabRef.current!.off("object:added");
    mainFabRef.current!.off("object:modified");
  };

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

    turnOnUndoListeners();

    // setup event listeners for shortcuts (a to add frame, z to undo)
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      // cleanup
      turnOffUndoListeners();

      document.removeEventListener("keydown", handleKeyDown);

      mainFabRef.current?.dispose();
      onionFabRef.current?.dispose();
      bgFabRef.current?.dispose();
    };
  }, []);

  return (
    /* MAIN WRAPPER */
    <div className="w-full h-full">
      {/**
       * TIMELINE
       */}
      <div className="w-full p-2">
        <div className="w-full border-2 border-black/15 rounded-md flex gap-2 p-2 justify-center">
          <button
            title="Add frame"
            ref={addKeyframeButtonRef}
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
            title="Delete frame"
            className="btn"
            onClick={() =>
              selectTimelineButton({ button: TimelineButton.REMOVE_KEYFRAME })
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
                d="M4.25 12a.75.75 0 0 1 .75-.75h14a.75.75 0 0 1 0 1.5H5a.75.75 0 0 1-.75-.75Z"
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
            onClick={() =>
              selectTimelineButton({ button: TimelineButton.PLAY })
            }
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

          {/* separator */}
          <div className="h-11 w-1 bg-black/75 rounded-sm" />

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
          <button
            title="Save"
            className="btn"
            onClick={() =>
              selectTimelineButton({ button: TimelineButton.SAVE })
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
                d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            title="Import"
            className="btn"
            onClick={() => {
              fileInputRef.current!.click();
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
                d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".json"
            onChange={(e) => {
              selectTimelineButton({
                button: TimelineButton.IMPORT,
                file: e.target.files![0],
              });
            }}
          />
        </div>

        {/* TIMELINE LIST */}
        {/* Force frame list to be on next flex line in entire wrapper, do this by taking full width*/}
        <div className="p-2 mt-2 bg-gray-300 border-2 border-black/15 rounded-md w-full">
          <div className="overflow-x-scroll w-full flex flex-row gap-2 p-2">
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
        <div className="h-full w-24 border-2 border-black/15 rounded-md flex flex-col items-center gap-2 p-2">
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
            title="Rectangle"
            className="btn"
            onClick={() => selectToolbarButton(ToolbarButton.RECT)}
          >
            <svg
              fill="#000000"
              width="32px"
              height="32px"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                fill: "black",
              }}
            >
              <path d="M 5 5 L 5 15 L 15 15 L 15 5 L 5 5 z" />
            </svg>
          </button>
          <button
            title="Circle"
            className="btn"
            onClick={() => selectToolbarButton(ToolbarButton.CIRCLE)}
          >
            <svg
              fill="#000000"
              width="32px"
              height="32px"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                fill: "black",
              }}
            >
              <circle cx="10" cy="10" r="6" />
            </svg>
          </button>
          <button
            title="Line"
            className="btn"
            onClick={() => selectToolbarButton(ToolbarButton.LINE)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-7 h-6"
            >
              <path
                fillRule="evenodd"
                d="M4.75 12.5a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.5a.75.75 0 0 1-.75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            title="Undo"
            className="btn"
            ref={undoButtonRef}
            onClick={() => selectToolbarButton(ToolbarButton.UNDO)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6 rotate-90 -translate-y-0.5"
            >
              <path
                fillRule="evenodd"
                d="M15 3.75A5.25 5.25 0 0 0 9.75 9v10.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V9a6.75 6.75 0 0 1 13.5 0v3a.75.75 0 0 1-1.5 0V9c0-2.9-2.35-5.25-5.25-5.25Z"
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
        <div className="h-[375.2px]">
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
                  defaultValue={mainFabRef.current?.freeDrawingBrush.width ?? 1}
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
                <input
                  type="color"
                  onChange={(e) => {
                    mainFabRef.current!.freeDrawingBrush.color = e.target.value;
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
