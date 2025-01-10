import sourceMapSupport from "source-map-support";
sourceMapSupport.install();

// Export all cloud function entrypoints here. The exported symbols
// are inputs to deployed cloud functions and are invoked when the
// function triggers.
export * from "./main.js";
