import {
  CaptureUpdateAction,
  Excalidraw,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import {
  EVENT,
  THEME,
  preventUnload,
  resolvablePromise,
} from "@excalidraw/common";
import {
  isElementLink,
  isInitializedImageElement,
  newElementWith,
} from "@excalidraw/element";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef } from "react";

import type { ResolvablePromise } from "@excalidraw/common/utils";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
  UIAppState,
} from "@excalidraw/excalidraw/types";

import { AnimationEditorDock } from "../src/animation/ui";
import { animationWorkspace } from "../src/animation/inspector";
import {
  attachAnimationProjectToSceneJson,
  loadLocalAnimationProject,
  readAnimationProjectFromSceneJson,
  saveLocalAnimationProject,
} from "../src/animation/persistence";

import { Provider, appJotaiStore } from "./app-jotai";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppSidebar } from "./components/AppSidebar";
import { CanvasGenerationLoading } from "./components/CanvasGenerationLoading";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import CustomStats from "./CustomStats";
import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
} from "./data/LocalData";
import { importFromLocalStorage } from "./data/localStorage";
import { useAppLangCode } from "./app-language/language-state";
import { getWorkspaceFileIdFromPath } from "./workspace/editorRoute";

import "./index.scss";

polyfill();
window.EXCALIDRAW_THROTTLE_RENDER = true;

type InitializedScene = {
  scene: ExcalidrawInitialDataState | null;
};

const initializeScene = async (): Promise<InitializedScene> => {
  const workspaceFileId = getWorkspaceFileIdFromPath();
  if (workspaceFileId) {
    try {
      const response = await fetch(
        `/api/workspace/files/${workspaceFileId}/content`,
      );
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => null))?.error ||
            "无法打开工作区文件",
        );
      }
      const blob = await response.blob();
      try {
        const project = readAnimationProjectFromSceneJson(await blob.text());
        if (project) {
          animationWorkspace.loadProject(project, false, 0);
        }
      } catch (error) {
        console.error("无法读取工作区动画数据", error);
      }
      const data = await loadFromBlob(blob, null, null);
      return { scene: { ...data, scrollToContent: true } };
    } catch (error) {
      return {
        scene: {
          appState: {
            errorMessage:
              error instanceof Error ? error.message : "无法打开工作区文件",
          },
        },
      };
    }
  }

  const localData = importFromLocalStorage();
  const localAnimationProject = loadLocalAnimationProject();
  if (localAnimationProject) {
    animationWorkspace.loadProject(localAnimationProject, false, 0);
  }
  return {
    scene: {
      elements: restoreElements(localData?.elements, null, {
        repairBindings: true,
        deleteInvisibleElements: true,
      }),
      appState: restoreAppState(localData?.appState, null),
    },
  };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const workspaceFileId = getWorkspaceFileIdFromPath();
  const workspaceSaveTimer = useRef<number | null>(null);
  const pendingWorkspaceContent = useRef<string | null>(null);
  const workspaceSaveInFlight = useRef<Promise<void> | null>(null);
  const [langCode] = useAppLangCode();
  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });

  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const loadImages = useCallback(
    async (data: InitializedScene) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }
      if (data.scene.files) {
        excalidrawAPI.addFiles(Object.values(data.scene.files));
      }
      const fileIds =
        data.scene.elements?.reduce<FileId[]>((ids, element) => {
          if (isInitializedImageElement(element)) {
            ids.push(element.fileId);
          }
          return ids;
        }, []) ?? [];
      if (fileIds.length) {
        const { loadedFiles, erroredFiles } =
          await LocalData.fileStorage.getFiles(fileIds);
        if (loadedFiles.length) {
          excalidrawAPI.addFiles(loadedFiles);
        }
        updateStaleImageStatuses({
          excalidrawAPI,
          erroredFiles,
          elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
        });
      }
      LocalData.fileStorage.clearObsoleteFiles({ currentFileIds: fileIds });
    },
    [excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    initializeScene().then(async (data) => {
      await loadImages(data);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = (event: HashChangeEvent) => {
      if (!parseLibraryTokensFromUrl()) {
        event.preventDefault();
        window.history.replaceState(
          {},
          "Animation Canvas",
          window.location.pathname,
        );
      }
    };
    window.addEventListener(EVENT.HASHCHANGE, onHashChange);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange);
    };
  }, [excalidrawAPI, loadImages]);

  const flushWorkspaceSave = useCallback(
    async ({ force = false, notify = false } = {}) => {
      if (!workspaceFileId) {
        if (notify) {
          excalidrawAPI?.setToast({
            message: "当前画板未关联工作区文件",
            duration: 3000,
          });
        }
        return;
      }
      if (force && !pendingWorkspaceContent.current && excalidrawAPI) {
        pendingWorkspaceContent.current = attachAnimationProjectToSceneJson(
          serializeAsJSON(
            excalidrawAPI.getSceneElementsIncludingDeleted(),
            excalidrawAPI.getAppState(),
            excalidrawAPI.getFiles(),
            "local",
          ),
          animationWorkspace.getSnapshot().project,
        );
      }
      if (workspaceSaveTimer.current) {
        window.clearTimeout(workspaceSaveTimer.current);
        workspaceSaveTimer.current = null;
      }
      if (!pendingWorkspaceContent.current) {
        return;
      }
      if (!workspaceSaveInFlight.current) {
        workspaceSaveInFlight.current = (async () => {
          while (pendingWorkspaceContent.current) {
            const content = pendingWorkspaceContent.current;
            const response = await fetch(
              `/api/workspace/files/${workspaceFileId}/content`,
              {
                method: "PUT",
                headers: {
                  "content-type": "application/vnd.excalidraw+json",
                },
                body: content,
              },
            );
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(payload?.error || "保存失败");
            }
            if (pendingWorkspaceContent.current === content) {
              pendingWorkspaceContent.current = null;
            }
          }
        })().finally(() => {
          workspaceSaveInFlight.current = null;
        });
      }
      await workspaceSaveInFlight.current;
      if (notify) {
        excalidrawAPI?.setToast({ message: "保存成功", duration: 3000 });
      }
    },
    [excalidrawAPI, workspaceFileId],
  );

  const queueWorkspaceSave = useCallback(
    (content: string) => {
      pendingWorkspaceContent.current = content;
      if (workspaceSaveTimer.current) {
        window.clearTimeout(workspaceSaveTimer.current);
      }
      workspaceSaveTimer.current = window.setTimeout(() => {
        void flushWorkspaceSave().catch((error) =>
          console.error("保存工作区失败", error),
        );
      }, 700);
    },
    [flushWorkspaceSave],
  );

  useEffect(() => {
    let previousProject = animationWorkspace.getSnapshot().project;
    return animationWorkspace.subscribe(() => {
      const project = animationWorkspace.getSnapshot().project;
      if (project === previousProject) {
        return;
      }
      previousProject = project;
      if (!workspaceFileId) {
        saveLocalAnimationProject(project);
        return;
      }
      if (!excalidrawAPI) {
        return;
      }
      queueWorkspaceSave(
        attachAnimationProjectToSceneJson(
          serializeAsJSON(
            excalidrawAPI.getSceneElementsIncludingDeleted(),
            excalidrawAPI.getAppState(),
            excalidrawAPI.getFiles(),
            "local",
          ),
          project,
        ),
      );
    });
  }, [excalidrawAPI, queueWorkspaceSave, workspaceFileId]);

  useEffect(() => {
    const flushWhenBackgrounded = (event: FocusEvent | Event) => {
      if (event.type !== EVENT.BLUR && !document.hidden) {
        return;
      }

      if (workspaceFileId) {
        void flushWorkspaceSave().catch((error) =>
          console.error("切换页面时保存工作区失败", error),
        );
      } else {
        LocalData.flushSave();
      }
    };

    window.addEventListener(EVENT.BLUR, flushWhenBackgrounded);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, flushWhenBackgrounded);
    return () => {
      window.removeEventListener(EVENT.BLUR, flushWhenBackgrounded);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        flushWhenBackgrounded,
      );
    };
  }, [flushWorkspaceSave, workspaceFileId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();
      if (workspaceFileId && pendingWorkspaceContent.current) {
        fetch(`/api/workspace/files/${workspaceFileId}/content`, {
          method: "PUT",
          headers: { "content-type": "application/vnd.excalidraw+json" },
          body: pendingWorkspaceContent.current,
          keepalive: true,
        }).catch((error) => console.error("离开页面前保存失败", error));
      }
      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        preventUnload(event);
      }
    };
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flushWorkspaceSave({ force: true, notify: true });
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, beforeUnload);
    window.addEventListener(EVENT.KEYDOWN, saveShortcut, true);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, beforeUnload);
      window.removeEventListener(EVENT.KEYDOWN, saveShortcut, true);
    };
  }, [excalidrawAPI, flushWorkspaceSave, workspaceFileId]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (workspaceFileId) {
      queueWorkspaceSave(
        attachAnimationProjectToSceneJson(
          serializeAsJSON(elements, appState, files, "local"),
          animationWorkspace.getSnapshot().project,
        ),
      );
      return;
    }
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (!excalidrawAPI) {
          return;
        }
        let didChange = false;
        const nextElements = excalidrawAPI
          .getSceneElementsIncludingDeleted()
          .map((element) => {
            if (LocalData.fileStorage.shouldUpdateImageElementStatus(element)) {
              didChange = true;
              return newElementWith(element, { status: "saved" });
            }
            return element;
          });
        if (didChange) {
          excalidrawAPI.updateScene({
            elements: nextElements,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      });
    }
  };

  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      let count = FileStatusStore.getPendingCount(snapshot.value);
      while (count.pending > 0) {
        yield {
          type: "progress",
          progress: (count.total - count.pending) / count.total,
          message: `Loading images (${count.total - count.pending}/${
            count.total
          })...`,
        };
        snapshot = await FileStatusStore.pull(snapshot.version);
        count = FileStatusStore.getPendingCount(snapshot.value);
      }
    },
    [],
  );

  return (
    <div className="powdoo-app editor-shell bg-muted/30">
      <main className="editor-shell__canvas">
        <Excalidraw
          onChange={onChange}
          onExport={onExport}
          initialData={initialStatePromiseRef.current.promise}
          UIOptions={{
            defaultSidebar: false,
            selectedShapeActions: false,
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
              export: false,
              saveAsImage: true,
            },
            tools: {
              image: true,
              extraTools: false,
            },
          }}
          langCode={langCode}
          renderCustomStats={(
            elements: readonly NonDeletedExcalidrawElement[],
            appState: UIAppState,
          ) => (
            <CustomStats
              setToast={(message) => excalidrawAPI!.setToast({ message })}
              appState={appState}
              elements={elements}
            />
          )}
          detectScroll={false}
          handleKeyboardGlobally
          autoFocus
          theme={THEME.LIGHT}
          renderTopRightUI={() => null}
          onLinkOpen={(element, event) => {
            if (element.link && isElementLink(element.link)) {
              event.preventDefault();
              excalidrawAPI?.setViewport({
                target: element.link,
                fit: "scale-down",
                animation: true,
              });
            }
          }}
        >
          <AppMainMenu
            onSave={() =>
              void flushWorkspaceSave({ force: true, notify: true })
            }
            onBackToWorkspace={() => window.location.assign("/")}
          />
          {excalidrawAPI && <AppSidebar />}
        </Excalidraw>
        <CanvasGenerationLoading />
      </main>
      <AnimationEditorDock />
    </div>
  );
};

const ExcalidrawApp = () => (
  <TopErrorBoundary>
    <Provider store={appJotaiStore}>
      <ExcalidrawAPIProvider>
        <ExcalidrawWrapper />
      </ExcalidrawAPIProvider>
    </Provider>
  </TopErrorBoundary>
);

export default ExcalidrawApp;
