import { addLink, getViewerEventBus, isTouchScreen } from "./utils.js";

const RicePDF = {
  config: {},
  options: { autoToolbar: false },
  scrollDir: -1,
  scrollMark: 0,
  oldScrollTop: 0,
  zoomScale: 0,
  zoomTfm: {},

  getReaderConfig() {
    return {
      docStyle: document.documentElement.style,
      viewer: document.getElementById("viewerContainer"),
      printButton: document.getElementById("printButton"),
      secondaryOpen: document.getElementById("secondaryOpenFile"),
      viewerClassList: document.getElementById("outerContainer").classList
    };
  },

  init() {
    const cssUrl = new URL("ricepdf.css", import.meta.url).href;
    addLink("stylesheet", cssUrl);
    this.load();
  },

  load() {
    this.config = this.getReaderConfig();
    /* Auto-hide toolbar by default on touch devices */
    if (isTouchScreen()) {
      this.options.autoToolbar = true;
    }
    const { viewer, printButton, secondaryOpen } = this.config;
    viewer.addEventListener("scroll", this.toggleToolbar.bind(this));
    viewer.addEventListener("dblclick", this.toggleSmartZoom.bind(this));
    document.addEventListener("keydown", this.handleShortcut.bind(this));
    this.recreateOpenFile(printButton, "print").addEventListener("click", e => {
      secondaryOpen.dispatchEvent(new Event("click"));
    });
    const app = window.PDFViewerApplication;
    getViewerEventBus(app).then(eventBus => {
      /* Set base URL of PDF's links (bookmarks) to the original URL */
      eventBus.on("documentinit", () => {
        app.pdfLinkService.baseUrl = app.baseUrl;
      });
      const options = JSON.parse(localStorage.getItem("ricepdf.options"));
      if (options?.showPdfTitle === false) {
        eventBus.on("metadataloaded", () => app.setTitleUsingUrl(app.url));
      }
      eventBus.on("documenterror", this.handleError.bind(this));
      eventBus.on("resize", this.resetZoomStatus.bind(this));
      eventBus.on("scalechanging", this.resetZoomStatus.bind(this));

      /* Feature 1: Restore reading position */
      eventBus.on("pagesinit", () => {
        const fingerprint = app.pdfDocument?.fingerprint;
        if (!fingerprint) return;
        const stored = localStorage.getItem("ricepdf.position." + fingerprint);
        if (stored) {
          try {
            const { page, scale } = JSON.parse(stored);
            if (page) app.page = page;
            if (scale) app.pdfViewer.currentScaleValue = scale;
          } catch(e) {}
        }
      });

      const savePosition = () => {
        const fingerprint = app.pdfDocument?.fingerprint;
        if (!fingerprint) return;
        const data = { page: app.page, scale: app.pdfViewer.currentScaleValue };
        localStorage.setItem("ricepdf.position." + fingerprint, JSON.stringify(data));
      };
      eventBus.on("pagechanging", savePosition);
      eventBus.on("scalechanging", savePosition);
    });
    
    this.initBookmarks();
  },

  recreateOpenFile(toolbarButton, name) {
    const openButton = toolbarButton.cloneNode(true);
    openButton.id = "openFile";
    openButton.classList.remove(name);
    openButton.classList.add("open-file");

    const updateElement = elem => {
      for (const attr of elem.attributes) {
        if (attr.value.includes(name)) {
          attr.value = attr.value.replaceAll(name, "open-file");
        }
      }
    };
    updateElement(openButton);
    for (const child of openButton.querySelectorAll("*")) {
      updateElement(child);
    }

    toolbarButton.before(openButton);
    return openButton;
  },

  /* Feature 5: Personal Bookmarks and Notes */
  initBookmarks() {
    const sidebarContent = document.getElementById("sidebarContent");
    const sidebarButtons = document.getElementById("sidebarViewButtons");
    if (!sidebarContent || !sidebarButtons || document.getElementById("bookmarksView")) return;
    
    // Add Bookmarks Panel to Sidebar Content
    const panel = document.createElement("div");
    panel.id = "bookmarksView";
    panel.className = "hidden";
    
    // Inject synchronous styles to prevent flexbox race conditions
    if (!document.getElementById("ricepdf-dynamic-styles")) {
      const style = document.createElement("style");
      style.id = "ricepdf-dynamic-styles";
      const iconUrl = new URL("../doq/addon/images/readerIcon.svg", import.meta.url).href;
      const highlightIconUrl = new URL("../pdfjs/web/images/toolbarButton-editorHighlight.svg", import.meta.url).href;
      style.textContent = `
        #bookmarksView, #highlightsView { position: absolute !important; inset: 0 !important; height: 100% !important; flex-direction: column !important; }
        #bookmarksView:not(.hidden), #highlightsView:not(.hidden) { display: flex !important; }
        #bookmarksList, #highlightsList { flex-grow: 1 !important; overflow-y: auto !important; padding: 10px !important; scrollbar-width: thin !important; }
        #bookmarksList::-webkit-scrollbar, #highlightsList::-webkit-scrollbar { width: 5px; }
        #bookmarksList::-webkit-scrollbar-thumb, #highlightsList::-webkit-scrollbar-thumb { background: var(--doorhanger-border-color, #ccc); border-radius: 5px; }
        #sidebarContent { box-shadow: none !important; border-right: 1px solid var(--toolbar-border-color, #ddd) !important; }
        #viewBookmarks::before { -webkit-mask-image: url("${iconUrl}") !important; mask-image: url("${iconUrl}") !important; }
        #viewHighlights::before { -webkit-mask-image: url("${highlightIconUrl}") !important; mask-image: url("${highlightIconUrl}") !important; }
        .bookmark-item { margin-bottom: 10px !important; padding: 8px !important; background: var(--doorhanger-bg-color, #fff) !important; color: var(--doorhanger-fg-color, #333) !important; border: 1px solid var(--doorhanger-border-color, #ddd) !important; border-radius: 4px !important; display: flex !important; flex-wrap: nowrap !important; align-items: flex-start !important; gap: 5px !important; }
        .bookmark-item .bm-page { font-weight: bold !important; cursor: pointer !important; color: var(--main-color, #0078d7) !important; flex-shrink: 0 !important; }
        .bookmark-item .bm-note { flex-grow: 1 !important; word-break: break-word !important; }
        .bookmark-item .bm-del { background: none !important; border: none !important; color: var(--main-color, #d9534f) !important; cursor: pointer !important; margin-left: 5px !important; font-size: 16px !important; }
        .add-bookmark { display: flex !important; padding: 10px !important; box-sizing: border-box !important; width: 100% !important; border-top: 1px solid var(--toolbar-border-color, #ddd) !important; background: var(--toolbar-bg-color, #e0e0e0) !important; margin-top: auto !important; }
        .add-bookmark input { min-width: 0 !important; width: 100% !important; flex-grow: 1 !important; padding: 5px !important; box-sizing: border-box !important; border: 1px solid var(--toolbar-border-color, #ccc) !important; border-radius: 3px !important; margin-right: 5px !important; background: var(--body-bg-color, #fff) !important; color: var(--main-color, #000) !important; }
        .add-bookmark button, .refresh-highlights-btn { flex-shrink: 0 !important; padding: 5px 10px !important; box-sizing: border-box !important; background: var(--toolbar-bg-color, #0078d7) !important; color: var(--main-color, #fff) !important; border: 1px solid var(--main-color, transparent) !important; border-radius: 3px !important; cursor: pointer !important; opacity: 0.9 !important; }
        .add-bookmark button:hover, .refresh-highlights-btn:hover { opacity: 1 !important; }
        .refresh-highlights-btn { width: 100% !important; margin-top: 10px !important; }
      `;
      document.head.appendChild(style);
    }
    
    panel.innerHTML = `
      <div id="bookmarksList"></div>
      <div class="add-bookmark">
        <input type="text" id="bookmarkNote" placeholder="Note (optional)">
        <button id="addBookmarkBtn">Add</button>
      </div>
    `;
    sidebarContent.appendChild(panel);

    // Add Highlights Panel
    const highlightsPanel = document.createElement("div");
    highlightsPanel.id = "highlightsView";
    highlightsPanel.className = "hidden";
    highlightsPanel.innerHTML = `
      <div id="highlightsList">
        <div style="padding: 10px; color: var(--doorhanger-fg-color, #333); opacity: 0.7; text-align: center;">
          Highlights will appear here.
        </div>
      </div>
      <div class="add-bookmark" style="justify-content: center;">
        <button id="refreshHighlightsBtn" class="refresh-highlights-btn">Refresh Highlights</button>
      </div>
    `;
    sidebarContent.appendChild(highlightsPanel);

    // Add Toggle Button to Sidebar Buttons
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "viewBookmarks";
    toggleBtn.className = "toolbarButton";
    toggleBtn.title = "Show Bookmarks & Notes";
    toggleBtn.setAttribute("role", "radio");
    toggleBtn.setAttribute("aria-checked", "false");
    toggleBtn.setAttribute("aria-controls", "bookmarksView");
    toggleBtn.innerHTML = "<span style='display:none;'>Bookmarks</span>";
    sidebarButtons.appendChild(toggleBtn);

    const toggleHighlightsBtn = document.createElement("button");
    toggleHighlightsBtn.id = "viewHighlights";
    toggleHighlightsBtn.className = "toolbarButton";
    toggleHighlightsBtn.title = "Show Highlights";
    toggleHighlightsBtn.setAttribute("role", "radio");
    toggleHighlightsBtn.setAttribute("aria-checked", "false");
    toggleHighlightsBtn.setAttribute("aria-controls", "highlightsView");
    toggleHighlightsBtn.innerHTML = "<span style='display:none;'>Highlights</span>";
    sidebarButtons.appendChild(toggleHighlightsBtn);

    const app = window.PDFViewerApplication;
    let bookmarks = {};
    const getFingerprint = () => {
      if (app.pdfDocument?.fingerprint) return app.pdfDocument.fingerprint;
      if (app.pdfDocument?.fingerprints?.[0]) return app.pdfDocument.fingerprints[0];
      if (app.url) return app.url.split('?')[0];
      return "default_doc";
    };

    const loadBookmarks = () => {
      const stored = localStorage.getItem("ricepdf.bookmarks");
      if (stored) {
        try { bookmarks = JSON.parse(stored); } catch(e) {}
      }
      renderBookmarks();
    };

    // Helper for tab switching
    const setupTab = (btn, panelElem, onLoad) => {
      btn.addEventListener("click", () => {
        // Hide all other views
        [...sidebarContent.children].forEach(child => child.classList.add("hidden"));
        panelElem.classList.remove("hidden");
        
        // Untoggle all buttons
        [...sidebarButtons.children].forEach(b => {
          b.classList.remove("toggled");
          b.setAttribute("aria-checked", "false");
        });
        btn.classList.add("toggled");
        btn.setAttribute("aria-checked", "true");
        
        if (onLoad) onLoad();
      });
    };

    setupTab(toggleBtn, panel, loadBookmarks);
    setupTab(toggleHighlightsBtn, highlightsPanel, () => {
      // Refresh highlights when opened
      document.getElementById("refreshHighlightsBtn")?.click();
    });

    // Make sure we un-toggle our custom buttons when standard PDF.js buttons are clicked
    [...sidebarButtons.children].forEach(btn => {
      if (btn !== toggleBtn && btn !== toggleHighlightsBtn) {
        btn.addEventListener("click", () => {
          panel.classList.add("hidden");
          highlightsPanel.classList.add("hidden");
          toggleBtn.classList.remove("toggled");
          toggleBtn.setAttribute("aria-checked", "false");
          toggleHighlightsBtn.classList.remove("toggled");
          toggleHighlightsBtn.setAttribute("aria-checked", "false");
        });
      }
    });

    const renderBookmarks = () => {
      const list = document.getElementById("bookmarksList");
      if (!list) return;
      list.innerHTML = "";
      const fp = getFingerprint();
      if (!fp || !bookmarks[fp]) return;
      
      bookmarks[fp].forEach((bm, i) => {
        const item = document.createElement("div");
        item.className = "bookmark-item";
        item.innerHTML = `<span class="bm-page" style="cursor:pointer; color:var(--main-color, #0078d7); font-weight:bold; flex-shrink:0; opacity:0.9;" title="Go to page ${bm.page}">Pg ${bm.page}</span> <span class="bm-note" style="flex-grow:1; word-break:break-word; color:var(--main-color, inherit);"></span> <button class="bm-del" data-idx="${i}" title="Delete bookmark" style="background:none; border:none; color:var(--main-color, red); cursor:pointer; flex-shrink:0; font-size:16px; padding:0 4px; opacity:0.8;">&times;</button>`;
        item.querySelector(".bm-note").textContent = bm.note; // Safe from HTML injection
        item.querySelector(".bm-page").addEventListener("click", () => {
          if (app.page) app.page = bm.page;
        });
        item.querySelector(".bm-del").addEventListener("click", () => {
          bookmarks[fp].splice(i, 1);
          saveBookmarks();
          renderBookmarks();
        });
        list.appendChild(item);
      });
    };

    const saveBookmarks = () => {
      localStorage.setItem("ricepdf.bookmarks", JSON.stringify(bookmarks));
    };

    // Use event delegation for the Add button and Input field to ensure it ALWAYS fires
    document.addEventListener("click", (e) => {
      if (e.target && e.target.id === "addBookmarkBtn") {
        e.preventDefault();
        
        const noteInput = document.getElementById("bookmarkNote");
        if (!noteInput) return;
        
        const fp = getFingerprint();
        if (!bookmarks[fp]) bookmarks[fp] = [];
        
        let currentPage = 1;
        if (app.pdfViewer && app.pdfViewer.currentPageNumber) {
          currentPage = app.pdfViewer.currentPageNumber;
        } else if (app.page) {
          currentPage = app.page;
        }
        
        const noteText = noteInput.value.trim() || `Page ${currentPage} note`;
        
        bookmarks[fp].push({
          page: currentPage,
          note: noteText
        });
        
        noteInput.value = "";
        saveBookmarks();
        renderBookmarks();
        
        // Provide visual feedback
        const originalText = e.target.textContent;
        e.target.textContent = "Added!";
        setTimeout(() => { e.target.textContent = originalText; }, 1000);
      } else if (e.target && e.target.id === "refreshHighlightsBtn") {
        e.preventDefault();
        const list = document.getElementById("highlightsList");
        if (!list) return;
        
        list.innerHTML = "<div style='padding:10px;text-align:center;'>Loading highlights...</div>";
        
        const extractHighlights = async () => {
          let found = 0;
          list.innerHTML = "";
          
          if (!app.pdfDocument) {
            list.innerHTML = "<div style='padding:10px;text-align:center;'>No document loaded.</div>";
            return;
          }
          
          try {
            // Check annotationStorage (new edits)
            let storageItems = [];
            const annStorage = app.pdfDocument.annotationStorage;
            if (annStorage) {
              let storage = null;
              if (typeof annStorage.getAll === 'function') {
                storage = annStorage.getAll();
              } else if (annStorage instanceof Map) {
                storage = annStorage;
              } else if (annStorage.serializable instanceof Map) {
                storage = annStorage.serializable;
              } else {
                // Try to see if it's an object with keys
                storage = annStorage;
              }
              
              if (storage instanceof Map) {
                storageItems = Array.from(storage.values());
              } else if (storage) {
                storageItems = Object.values(storage).filter(v => v !== null && typeof v === 'object');
              }
            }
            
            // Also check page annotations (existing in PDF)
            const numPages = app.pdfDocument.numPages;
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
              let pageHighlights = [];
              
              // Annotations already saved in the PDF
              let pageTextContent = null;
              const getPageText = async (page) => {
                if (!pageTextContent) {
                  try { pageTextContent = await page.getTextContent(); } catch(e) {}
                }
                return pageTextContent;
              };

              const extractText = async (page, quads, rect) => {
                const textData = await getPageText(page);
                if (!textData || !textData.items) return null;
                let extracted = "";
                
                // If we have quads (standard for text highlights)
                let regions = [];
                if (quads && quads.length > 0) {
                  for (let q of quads) {
                    if (q.length === 8) {
                      regions.push({
                        minX: Math.min(q[0], q[2], q[4], q[6]),
                        maxX: Math.max(q[0], q[2], q[4], q[6]),
                        minY: Math.min(q[1], q[3], q[5], q[7]),
                        maxY: Math.max(q[1], q[3], q[5], q[7])
                      });
                    } else if (q.x !== undefined) { // Objects
                       // some versions use array of objects {x,y}
                    }
                  }
                } else if (rect && rect.length === 4) {
                  regions.push({
                    minX: Math.min(rect[0], rect[2]),
                    maxX: Math.max(rect[0], rect[2]),
                    minY: Math.min(rect[1], rect[3]),
                    maxY: Math.max(rect[1], rect[3])
                  });
                }
                
                if (regions.length === 0) return null;
                
                for (const region of regions) {
                  for (const item of textData.items) {
                    if (!item.str || item.str.trim() === "") continue;
                    const tx = item.transform[4];
                    const ty = item.transform[5];
                    const tw = item.width;
                    const th = item.height;
                    const intersectX = !(tx + tw < region.minX || tx > region.maxX);
                    const intersectY = !(ty + th < region.minY || ty > region.maxY);
                    if (intersectX && intersectY) {
                      extracted += item.str + " ";
                    }
                  }
                }
                return extracted.trim();
              };

              try {
                const page = await app.pdfDocument.getPage(pageNum);
                const annots = await page.getAnnotations();
                
                // Native annotations
                if (annots && Array.isArray(annots)) {
                  const highlightAnnots = annots.filter(a => a.subtype === "Highlight");
                  for (const a of highlightAnnots) {
                    let text = a.contents || a.title;
                    if (!text) text = await extractText(page, a.quadPoints, a.rect);
                    pageHighlights.push({ type: "Native", color: a.color, id: a.id, text: text || "Highlight" });
                  }
                }
                
                // New edits from annotationStorage mapped to this page
                const pageEdits = storageItems.filter(item => item.pageIndex === pageNum - 1 && (item.annotationType === 3 /* Highlight */ || (item.name && item.name.includes("highlight"))));
                for (const edit of pageEdits) {
                  let text = edit.contents || edit.title;
                  if (!text) text = await extractText(page, edit.quadPoints, edit.rect);
                  pageHighlights.push({ type: "Edit", color: edit.color, id: edit.id, text: text || "Highlight" });
                }
              } catch (e) {
                console.error("Error fetching annotations for page", pageNum, e);
              }
              
              if (pageHighlights.length > 0) {
                const getColor = (c) => {
                  if (!c) return "transparent";
                  if (Array.isArray(c) || c instanceof Uint8Array || c instanceof Uint8ClampedArray) {
                    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
                  }
                  return c;
                };

                for (const hl of pageHighlights) {
                  found++;
                  const c = getColor(hl.color);
                  const item = document.createElement("div");
                  item.className = "bookmark-item";
                  item.innerHTML = `
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${c}; margin-top:4px; flex-shrink:0;"></span>
                    <span class="bm-page" style="cursor:pointer; color:var(--main-color, #0078d7); font-weight:bold; flex-shrink:0; margin-left:5px;" title="Go to page ${pageNum}">Pg ${pageNum}</span>
                    <span class="bm-note" style="flex-grow:1; margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px; color:var(--doorhanger-fg-color, inherit);" title="${hl.text}">${hl.text}</span>
                  `;
                  item.querySelector(".bm-page").addEventListener("click", () => {
                    if (app.page) app.page = pageNum;
                  });
                  list.appendChild(item);
                }
              }
            }
            
            if (found === 0) {
              list.innerHTML = "<div style='padding:10px;text-align:center;'>No highlights found.</div>";
            }
          } catch (err) {
            console.error("Error extracting highlights", err);
            list.innerHTML = "<div style='padding:10px;text-align:center;'>Error loading highlights: " + (err.message || String(err)) + "</div>";
          }
        };
        
        extractHighlights();
      }
    });
    
    document.addEventListener("keypress", (e) => {
      if (e.target && e.target.id === "bookmarkNote" && e.key === "Enter") {
        e.preventDefault();
        document.getElementById("addBookmarkBtn")?.click();
      }
    });
  },

  toggleToolbar() {
    const smallDevice = window.matchMedia("(max-height: 384px)");
    if (!this.options.autoToolbar || !smallDevice.matches) {
      return;
    }
    const hideThresh = 50, showThresh = -20;
    const {viewer} = this.config;
    let delta = viewer.scrollTop - this.oldScrollTop;
    this.oldScrollTop = viewer.scrollTop;
    if (!this.scrollMark && this.scrollDir * delta < 0) {
      this.scrollDir = -this.scrollDir;
      this.scrollMark = viewer.scrollTop;
    }
    if (this.scrollMark) {
      const { viewerClassList } = this.config;
      delta = viewer.scrollTop - this.scrollMark;
      if (delta > hideThresh) {
        viewerClassList.add("toolbarHidden", "auto");
        this.scrollMark = 0;
      } else if (delta < showThresh) {
        viewerClassList.remove("toolbarHidden", "auto");
        this.scrollMark = 0;
      }
    }
  },

  handleShortcut(e) {
    const tag = e.target.tagName;
    const modifier = e.ctrlKey || e.metaKey || e.altKey;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        e.target.isContentEditable || modifier)
      return;
    if (e.code === "F3" && !e.shiftKey) {
      const { viewerClassList } = this.config;
      viewerClassList.toggle("toolbarHidden");
      viewerClassList.remove("auto");
      e.preventDefault();
    } else if (e.shiftKey && (e.key === "O" || e.key === "o")) {
      document.getElementById("secondaryOpenFile")?.click();
      e.preventDefault();
    } else if (e.shiftKey && (e.key === "H" || e.key === "h")) {
      document.getElementById("editorHighlightButton")?.click();
      e.preventDefault();
    } else if (e.shiftKey && (e.key === "S" || e.key === "s")) {
      this.triggerSave();
      e.preventDefault();
    } else if (e.key === "z" || e.key === "Z") {
      this.toggleSmartZoom(e);
    }
  },

  async triggerSave() {
    const app = window.PDFViewerApplication;
    if (!app || !app.pdfDocument) return;

    try {
      // 1. Get raw bytes of the current PDF
      const data = await app.pdfDocument.saveDocument();
      // 2. Create blob URL
      const blob = new Blob([data], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      
      // 3. Extract original filename
      let filename = app.url.split('/').pop() || "document.pdf";
      if (filename.includes('?')) filename = filename.split('?')[0];
      
      // 4. Send to background script which triggers the exact Save As dialog
      browser.runtime.sendMessage({
        action: "download",
        url: blobUrl,
        filename: decodeURIComponent(filename)
      });
      
      // Visual feedback
      const originalTitle = document.title;
      document.title = "✅ Saving...";
      setTimeout(() => { document.title = originalTitle; }, 2000);
      
    } catch (err) {
      console.error("Failed to trigger custom save dialog", err);
      // Fallback
      const downloadBtn = document.getElementById("download");
      if (downloadBtn) downloadBtn.click();
    }
  },

  handleError(details) {
    const app = window.PDFViewerApplication;
    window.alert(details.message);
    app.loadingBar?.hide();
    app.close();
    chrome.runtime.sendMessage({ action: "removeViewer" });
  },

  /* Smart zoom */
  toggleSmartZoom(e) {
    const pdfViewer = window.PDFViewerApplication.pdfViewer;
    if (!pdfViewer.pagesCount || pdfViewer.isInPresentationMode ||
        pdfViewer.annotationEditorMode > 0)
      return;
    if (e.detail > 0 && !("ontouchstart" in window))    /* not a double tap */
      return;
    e.preventDefault();
    const viewBox = pdfViewer.container;
    const {target, coord} = this.getZoomTarget(e, viewBox);
    const pageNum = target.closest(".page")?.dataset.pageNumber ||
                    pdfViewer.currentPageNumber;
    const page = pdfViewer.getPageView(pageNum - 1);
    const curZoom = page.div.offsetWidth / viewBox.clientWidth;
    /* Smart zoom only if page is in view range, but zoomed out */
    if (curZoom > 0.8 && curZoom < 2 && !this.zoomScale) {
      this.zoomTfm = this.smartZoom(target, coord, page);
      const scroll = Math.round(-this.zoomTfm.scrollX);
      this.config.docStyle.setProperty("--scroll-snap", scroll + "px");
      this.config.viewerClassList.add("smartZoom")
    } else {
      const zoomInv = 1 / this.zoomTfm.scale || 1;
      pdfViewer.currentScaleValue = "page-width";
      viewBox.scrollBy(0, (zoomInv - 1) * coord);
    }
  },
  getZoomTarget(e, viewBox) {
    let tgt, ypos;
    if (e.detail) {         /* Double click */
      tgt = e.target;
      ypos = e.clientY;
    } else {                /* Keyboard shortcut */
      tgt = [...document.querySelectorAll(".page :hover")].pop() || viewBox;
      const tgtRect = tgt.getBoundingClientRect();
      ypos = (tgtRect.top + tgtRect.bottom) / 2;
    }
    return {target: tgt, coord: ypos - viewBox.offsetTop};
  },

  smartZoom(target, coord, page, nbrLines = 1, zoomPad = 0.015, maxZoom = 5) {
    const pdfViewer = window.PDFViewerApplication.pdfViewer;
    const viewBox = pdfViewer.container;
    const tgtRect = target.getBoundingClientRect();
    const nbrRects = r => {
      const {top, bottom, height} = tgtRect;
      const range = (nbrLines + 0.5) * height;
      return (r.top > top - range) && (r.bottom < bottom + range);
    }
    /* Get non-empty text rects around target in the page */
    const textLayerDiv = page.textLayer.div;
    const texts = [...textLayerDiv.querySelectorAll("span")];
    let textRects = texts.map(e => e.getBoundingClientRect());
    if (texts.includes(target))
      textRects = this.colRects(target, textRects.filter(nbrRects));
    const pageLeft = textLayerDiv.getBoundingClientRect().left;
    /* Find zoom & scroll to fit text span to viewer width */
    const minLeft = Math.min(...textRects.map(r => r.left));
    const maxRight = Math.max(...textRects.map(r => r.right));
    const textSpan = maxRight - minLeft;
    let zoom = 1, offset = viewBox.scrollLeft, scroll = 0;
    if (textSpan > 0) {
      zoom = viewBox.clientWidth / textSpan * (1 - 2 * zoomPad);
      zoom = Math.min(zoom, maxZoom);
      offset = page.div.clientLeft + (minLeft - pageLeft) * zoom;
      offset -= viewBox.clientWidth * zoomPad;
      scroll = (zoom - 1) * coord;
      /* Apply if a valid zoom */
      if (zoom && zoom > 0) {
        this.zoomScale = zoom * page.scale;
        pdfViewer.currentScale = this.zoomScale;
        viewBox.scrollTo(offset, viewBox.scrollTop + scroll);
      }
    }
    return {scale: zoom, scrollX: offset, scrollY: scroll};
  },

  colRects(target, rects, gutterSize = 2.5) {
    const tgtRect = target.getBoundingClientRect();
    const charWidth = tgtRect.width / target.innerText.length;
    const range = gutterSize * charWidth;
    let {left, right} = tgtRect;
    let nbrs = [tgtRect];
    let addRects;
    do {
      addRects = 0;
      rects.forEach(r => {
        if (nbrs.includes(r))
          return;
        if (r.left < left && r.right > left - range) {
          nbrs.push(r);
          left = Math.min(left, r.left);
          ++addRects;
        } else if (r.right > right && r.left < right + range) {
          nbrs.push(r);
          right = Math.max(right, r.right);
          ++addRects;
        }
      });
    } while (addRects);
    return nbrs;
  },

  resetZoomStatus(e) {
    if (e.scale !== this.zoomScale) {
      this.zoomScale = 0;
      this.zoomTfm = {};
      this.config.viewerClassList.remove("smartZoom")
      this.config.docStyle.removeProperty("--scroll-snap");
    }
  }
}

/* Initialisation */
if (document.readyState === "interactive" || document.readyState === "complete") {
  RicePDF.init();
} else {
  document.addEventListener("DOMContentLoaded", RicePDF.init, true);
}
