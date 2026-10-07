import { createDemoModel, type ChangeType } from "./model";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./styles.css";
import { renderPage, type DetailTab } from "./page";

const model = createDemoModel(0);
const app = document.querySelector<HTMLDivElement>("#app")!;

if (!app) {
  throw new Error("recipe demo root is missing");
}

let selectedRowId = model.corpus.testRows[0].id;
let claimedType: ChangeType = model.corpus.testRows[0].changeType;
let detailTab: DetailTab = "head";

function render(): void {
  app.innerHTML = renderPage(model, selectedRowId, claimedType, detailTab);
  bindControls();
}

function bindControls(): void {
  const headSelect = document.querySelector<HTMLSelectElement>("#head-select");
  const typeSelect = document.querySelector<HTMLSelectElement>("#type-select");
  const randomHead = document.querySelector<HTMLButtonElement>("#random-head");

  headSelect?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    selectedRowId = select.value;
    const row = model.corpus.testRows.find((candidate) => candidate.id === selectedRowId)!;
    claimedType = row.changeType;
    render();
  });

  randomHead?.addEventListener("click", () => {
    const row = model.randomTestHead();
    selectedRowId = row.id;
    claimedType = row.changeType;
    render();
  });

  typeSelect?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    claimedType = select.value as ChangeType;
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      detailTab = button.dataset.detailTab as DetailTab;
      render();
    });
  });
}

render();
