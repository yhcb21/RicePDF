
import { DOQ } from "./config.js";
import { updatePreference } from "./prefs.js";
import { wrapCanvas, setCanvasTheme } from "../lib/engine.js";
import * as Annots from "../lib/annots.js";

function initReader() {
  const cvsp = HTMLCanvasElement.prototype;
  const origGetContext = cvsp.getContext;
  cvsp.getContext = function() {
    const pageNum = this.closest(".page")?.dataset.pageNumber;
    if (pageNum) {
      this.setAttribute("data-cache-id", "page" + pageNum);
    }
    return origGetContext.apply(this, arguments);
  };
  wrapCanvas();
  DOQ.initialized = true;
}

function updateReaderColors(e) {
  const { config } = DOQ;
  const picker = config.tonePicker;
  const pick = picker.readerTone.value;
  const sel = config.schemeSelector.selectedIndex;
  const redraw = e?.isTrusted;

  if (pick == 0) {
    disableReader(redraw);
    disableFilter();
    config.docStyle.removeProperty("--body-bg-color");
    config.docStyle.removeProperty("--toolbar-bg-color");
    config.docStyle.removeProperty("--sidebar-bg-color");
    config.docStyle.removeProperty("--sidebar-toolbar-bg-color");
    config.docStyle.removeProperty("--toolbar-border-color");
    config.docStyle.removeProperty("--main-color");
    config.docStyle.removeProperty("--button-hover-color");
    config.docStyle.removeProperty("--field-bg-color");
    config.docStyle.removeProperty("--field-color");
    config.docStyle.removeProperty("--field-border-color");
    config.docStyle.removeProperty("--dropdown-btn-bg-color");
    config.docStyle.removeProperty("--doorhanger-bg-color");
    config.docStyle.removeProperty("--doorhanger-border-color");
    config.docStyle.removeProperty("--doorhanger-hover-color");
    config.docStyle.removeProperty("--doorhanger-separator-color");
  } else if (pick == picker.elements.length - 1) {
    enableFilter(redraw);
    config.docStyle.removeProperty("--body-bg-color");
    config.docStyle.removeProperty("--toolbar-bg-color");
    config.docStyle.removeProperty("--sidebar-bg-color");
    config.docStyle.removeProperty("--sidebar-toolbar-bg-color");
    config.docStyle.removeProperty("--toolbar-border-color");
    config.docStyle.removeProperty("--main-color");
    config.docStyle.removeProperty("--button-hover-color");
    config.docStyle.removeProperty("--field-bg-color");
    config.docStyle.removeProperty("--field-color");
    config.docStyle.removeProperty("--field-border-color");
    config.docStyle.removeProperty("--dropdown-btn-bg-color");
    config.docStyle.removeProperty("--doorhanger-bg-color");
    config.docStyle.removeProperty("--doorhanger-border-color");
    config.docStyle.removeProperty("--doorhanger-hover-color");
    config.docStyle.removeProperty("--doorhanger-separator-color");
  } else {
    const readerTone = setCanvasTheme(sel, +pick - 1);
    const isDarkTone = readerTone.colors.bg.lightness < 50;
    config.docStyle.setProperty("--reader-bg", readerTone.background);
    
    // Set UI colors slightly darker than the pdf page theme
    const bg = readerTone.colors.bg;
    const uiLab = [...bg.lab];
    uiLab[0] = Math.max(0, uiLab[0] - 5);
    const uiBg = new bg.constructor(uiLab, "lab").toHex();
    
    const borderLab = [...bg.lab];
    borderLab[0] = Math.max(0, borderLab[0] - 12);
    const uiBorder = new bg.constructor(borderLab, "lab").toHex();
    
    config.docStyle.setProperty("--body-bg-color", uiBg);
    config.docStyle.setProperty("--toolbar-bg-color", uiBg);
    config.docStyle.setProperty("--sidebar-bg-color", uiBg);
    config.docStyle.setProperty("--sidebar-toolbar-bg-color", uiBg);
    config.docStyle.setProperty("--toolbar-border-color", uiBorder);
    config.docStyle.setProperty("--button-hover-color", uiBorder);
    config.docStyle.setProperty("--main-color", readerTone.foreground);

    // Style page fields, dropdowns, and "more tools" doorhanger menu
    config.docStyle.setProperty("--field-bg-color", readerTone.background);
    config.docStyle.setProperty("--field-color", readerTone.foreground);
    config.docStyle.setProperty("--field-border-color", uiBorder);
    config.docStyle.setProperty("--dropdown-btn-bg-color", uiBg);
    config.docStyle.setProperty("--doorhanger-bg-color", uiBg);
    config.docStyle.setProperty("--doorhanger-border-color", uiBorder);
    config.docStyle.setProperty("--doorhanger-hover-color", readerTone.foreground);
    config.docStyle.setProperty("--doorhanger-separator-color", uiBorder);

    disableFilter();
    enableReader(redraw, isDarkTone);
  }
  updatePreference("tone", pick);
}

function enableReader(redraw, isDarkTheme) {
  const { viewerClassList } = DOQ.config;
  viewerClassList.add("reader");
  viewerClassList.toggle("dark", isDarkTheme);
  DOQ.flags.engineOn = true;
  if (redraw) {
    forceRedraw();
  }
}

function disableReader(redraw) {
  const { config, flags } = DOQ;
  if (!flags.engineOn) {
    return;
  }
  config.viewerClassList.remove("reader", "dark");
  flags.engineOn = false;
  if (redraw) {
    forceRedraw();
  }
}

function enableFilter(redraw) {
  if (DOQ.flags.engineOn) {
    disableReader(redraw);
  }
  DOQ.config.viewerClassList.add("filter");
}

function disableFilter() {
  DOQ.config.viewerClassList.remove("filter");
}

function toggleFlags(e) {
  const { flags } = DOQ;
  const flag = e.target.id.replace("Enable", "sOn");

  flags[flag] = e.target.checked;
  updatePreference(flag);
  if (flags.engineOn) {
    forceRedraw();
  }
}

function handleAnnotations(e) {
  const { canvas, annotationEditorLayer, eventBus } = e.source;
  Annots.monitorAnnotations(canvas?.parentElement);
  Annots.monitorEditorEvents(annotationEditorLayer.div, eventBus);
}

function forceRedraw() {
  const { pdfViewer, pdfThumbnailViewer } = window.PDFViewerApplication;
  const annotStore = pdfViewer.pdfDocument?.annotationStorage;
  let annotations;

  try {
    annotations = Object.values(annotStore.getAll() || {});   /* PDF.js < 5.2 */
  } catch (e) {
    annotations = [...annotStore].map(e => e[1]);
  }
  annotations.forEach(Annots.redrawAnnotation);
  pdfViewer._pages.filter(e => e.renderingState).forEach(e => e.reset());
  pdfThumbnailViewer._thumbnails.filter(e => e.renderingState)
                                .forEach(e => e.reset());
  window.PDFViewerApplication.forceRendering();
}

export { initReader, updateReaderColors, toggleFlags, handleAnnotations };
