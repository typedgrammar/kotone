import { render } from "solid-js/web";
import { agent } from "./agent.ts";
import { App } from "./App.tsx";
import { app } from "./state.ts";
import "./styles.css";

render(() => <App />, document.getElementById("root")!);

// a scripted walkthrough (`--tour`, for the promo video) drives the app through its state
if ((window as { __kotoneTour?: unknown }).__kotoneTour) Object.assign(window, { kotone: { app, agent } });
