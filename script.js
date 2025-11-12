/* * =========================================
 * JAVASCRIPT-FIL FÖR PROCHORDER (NY LAYOUT)
 * =========================================
 */

const SHARED_SONG_LIST_URL =
  "https://raw.githubusercontent.com/Gobonkers65/ProChorder/main/songs-backup.json";

class StableChordEditor {
  static STORAGE_KEYS = {
    PROJECTS: "stableProjects",
    LAST_PROJECT: "lastProject",
    DARK_MODE: "darkMode",
  };

  // --- KÄRNFUNKTIONER (oförändrade) ---

  handleAutoLinking(e) {
    if (e.key !== " " && e.key !== "Enter") return;
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;
    const textContent = container.textContent.substring(0, range.startOffset);
    const customLinkRegex = /\[\[(.+?)(?:\|(.*?))?\]\]\s*$/;
    const autoLinkRegex =
      /(?:^|\s)((?:https?:\/\/\S+|(?:www|ftp)\.\S+))\s*$/;
    const customMatch = textContent.match(customLinkRegex);
    const autoMatch = !customMatch && textContent.match(autoLinkRegex);
    let url, linkText, startIndex, fullMatchLength;
    if (customMatch) {
      url = customMatch[1].trim();
      linkText = (customMatch[2] || "").trim() || url;
      const fullMatchString = customMatch[0].trimEnd();
      startIndex = textContent.lastIndexOf(fullMatchString);
      fullMatchLength = fullMatchString.length;
    } else if (autoMatch) {
      url = autoMatch[1];
      linkText = url;
      startIndex = textContent.lastIndexOf(url);
      fullMatchLength = url.length;
    } else {
      return;
    }
    if (!url || startIndex === -1) return;
    e.preventDefault();
    const replaceRange = document.createRange();
    replaceRange.setStart(container, startIndex);
    replaceRange.setEnd(container, startIndex + fullMatchLength);
    replaceRange.deleteContents();
    const link = document.createElement("a");
    link.href =
      url.startsWith("http") || url.startsWith("//") ? url : `http://${url}`;
    link.textContent = linkText;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    replaceRange.insertNode(link);
    range.setStartAfter(link);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    this.recordHistoryDebounced();
  }

  openTunerModal() {
    this.tunerModal.classList.add("visible");
    this.startTuner();
  }

  closeTunerModal() {
    this.tunerModal.classList.remove("visible");
    this.stopTuner();
  }

async startTuner() {
  // Laddar tuner-appen i vår iframe
  if (this.tunerIframe) {
    this.tunerIframe.src = "tuner/index.html";
  }
}

stopTuner() {
  // Återställer iframen - detta stoppar mikrofonen och all körning!
  if (this.tunerIframe) {
    this.tunerIframe.src = "about:blank";
  }
  // Du kan ta bort/behålla denna rad, den behövs inte längre
  // this.tunerDisplay.textContent = "--"; 
}

  constructor(editorId) {
    this.editor = document.getElementById(editorId);
    this.editMode = "chord";
    this.draggedChord = null;
    this.scrollInterval = null;
    this.scrollSpeed = 0.2;
    this.history = [];
    this.historyIndex = -1;
    this.debounceTimer = null;
    this.currentlyEditing = null;
    this.musicalNotes = [
      "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#",
    ];
    this.historyMax = 100;
    this.MIN_MOVE_SPEED = 0.02;
    this.MAX_MOVE_SPEED = 0.5;
    this.radialTypes = [
      "", "m", "6", "m6", "7", "m7", "9", "m9", "11", "m11", "maj7",
      "sus4", "dim", "aug",
    ];
    this.radialBassNotes = [
      "(root)", "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#",
    ];
    this.radialState = {
      root: "C",
      type: "",
      base: "(root)",
      rootIndex: 3,
      typeIndex: 0,
      baseIndex: 0,
    };

    this.selectElements(); // Kör först
    this.wakeLock = null;
    this.observer = new MutationObserver(this.handleMutations.bind(this));
    this.init(); // Kör sist
  }

  // ***
  // *** VIKTIG UPPDATERING:  ***
  // *** Matchar nu din nya index.html
  // ***
  selectElements() {
    // Topp-bar & Meny
    this.hamburgerBtn = document.getElementById("hamburger-btn");
    this.sideMenu = document.getElementById("side-menu");
    this.menuOverlay = document.getElementById("menu-overlay");
    this.mainToggleEditModeBtn = document.getElementById(
      "main-toggle-edit-mode-btn"
    );
    this.btnShowHelp = document.getElementById("btn-show-help");
    this.btnToggleDarkMode = document.getElementById(
      "btn-toggle-dark-mode"
    );

    // Projekt/Sång (Topp-bar)
    this.projectSelectorBtn = document.getElementById("project-selector-btn");
    this.currentProjectName = document.getElementById(
      "current-project-name"
    );
    this.projectList = document.getElementById("project-list");
    this.projectDropdownMenu = document.getElementById(
      "project-dropdown-menu"
    );
    this.btnNewProject = document.getElementById("btn-new-project");

    // Sång-info (Sidomeny)
    this.titleInput = document.getElementById("song-title");
    this.authorInput = document.getElementById("song-author");
    this.btnToggleScrollMode = document.getElementById(
      "btn-toggle-scroll-mode"
    );
    this.fontSizeSlider = document.getElementById("font-size-slider");

    // Knappar i sidomenyns rutnät
    this.tunerIframe = document.getElementById("tuner-iframe");
    this.btnOpenTunerModal = document.getElementById("btn-open-tuner-modal");
    this.btnOpenTransposeModal = document.getElementById(
      "btn-open-transpose-modal"
    );
    this.btnToggleChordMode = document.getElementById(
      "btn-toggle-chord-mode"
    );
    this.chordModeIconText = document.getElementById("chord-mode-icon-text");
    this.btnOpenSectionsModal = document.getElementById(
      "btn-open-sections-modal"
    );
    this.btnOpenExportModal = document.getElementById(
      "btn-open-export-modal"
    );
    this.btnOpenImportModal = document.getElementById(
      "btn-open-import-modal"
    );

    // Projektknappar (Spara/Ta bort)
    this.btnSaveProject = document.getElementById("btn-save-project");
    this.btnDeleteProject = document.getElementById("btn-delete-project");
    this.btnDeleteAllProjects = document.getElementById(
      "btn-delete-all-projects"
    );

    // Modaler & deras innehåll
    this.tunerModal = document.getElementById("tuner-modal");
    this.tunerBtnClose = document.getElementById("tuner-btn-close");
    this.tunerDisplay = document.getElementById("tuner-display");

    this.transposeModal = document.getElementById("transpose-modal");
    this.transposeModalClose = document.getElementById(
      "transpose-modal-close"
    );
    this.btnTransposeUp = document.getElementById("btn-transpose-up");
    this.btnTransposeDown = document.getElementById("btn-transpose-down");

    this.sectionsModal = document.getElementById("sections-modal");
    this.sectionsModalClose = document.getElementById(
      "sections-modal-close"
    );
    this.sectionTypeSelect = document.getElementById(
      "section-type-select-menu"
    );
    this.btnInsertSection = document.getElementById("btn-insert-section");

    this.exportModal = document.getElementById("export-modal");
    this.exportModalClose = document.getElementById("export-modal-close");
    this.btnExportPdf = document.getElementById("btn-export-pdf");
    this.btnExportTxt = document.getElementById("btn-export-txt");
    this.btnExportZip = document.getElementById("btn-export-zip");
    this.btnExportJson = document.getElementById("btn-export-json");
    this.btnExportAllJson = document.getElementById("btn-export-all-json");

    this.importModal = document.getElementById("import-modal");
    this.importModalClose = document.getElementById("import-modal-close");
    this.btnImportJson = document.getElementById("btn-import-json");
    this.btnImportUrl = document.getElementById("btn-import-url");
    this.fileImport = document.getElementById("file-import");

    // Ackord-byggare
    this.chordEditorModal = document.getElementById("chord-editor-modal");
    this.modalBtnRemove = document.getElementById("modal-btn-remove");
    this.modalBtnClose = document.getElementById("modal-btn-close");

    // Scroll-kontroller
    this.scrollControls = document.getElementById("scroll-controls");
    this.scrollBtnPlayPause = document.getElementById(
      
      "scroll-btn-play-pause"
    );
    this.scrollDurationText = document.getElementById("scroll-duration-text");
    this.scrollBtnExit = document.getElementById("scroll-btn-exit");
    this.scrollSpeedSlider = document.getElementById(
      "scroll-speed-slider"
    );
    this.scrollDurationMinutesInput = document.getElementById(
      "scroll-duration-minutes"
    );
    this.scrollDurationSecondsInput = document.getElementById(
      "scroll-duration-seconds"
    );
    this.scrollBtnPrev = document.getElementById("scroll-btn-prev");
    this.scrollBtnNext = document.getElementById("scroll-btn-next");

    // Övrigt
    this.editor = document.getElementById("editor");
    this.dropIndicator = document.createElement("div");
    this.dropIndicator.id = "drop-indicator";
    document.body.appendChild(this.dropIndicator);
    this.floatingLiveBtn = document.getElementById("floating-live-btn");
  }

  init() {
    this.populateSelects();
    this.applySavedTheme();
    this.setupEventListeners();
    this.updateModeUI(); // Kör denna för att ställa in "C"-ikonen korrekt
    this.setScrollSpeed(this.scrollSpeedSlider.value);
    this.updateDurationFromSpeed();
    this.startObserver();
    this.loadLastProject();
  }

  populateSelects() {
    const sectionData = [
      "Intro", "Verse", "Chorus", "Stick", "Bridge", "Solo", "Outro", "Dig",
    ];
    const populate = (sel, options, placeholder) => {
      if (!sel) return;
      sel.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
      options.forEach(
        (o) => (sel.innerHTML += `<option value="${o}">${o}</option>`)
      );
    };
    populate(this.sectionTypeSelect, sectionData, "Select Section...");
  }

  applySavedTheme() {
    const isDarkMode =
      localStorage.getItem(StableChordEditor.STORAGE_KEYS.DARK_MODE) ===
      "enabled";
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      this.btnToggleDarkMode.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-medium">
              <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM5.404 15.657a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 101.06 1.06l1.06-1.06zM17 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM4.25 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM15.657 14.596a.75.75 0 101.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 4.343a.75.75 0 101.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06z"/>
            </svg>`;
    } else {
      document.body.classList.remove("dark-mode");
      this.btnToggleDarkMode.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-medium">
              <path fill-rule="evenodd" d="M7.455 2.104a.75.75 0 00-.98 1.126 8.5 8.5 0 008.62 8.62.75.75 0 001.127-.98 10 10 0 01-9.767-8.766z" clip-rule="evenodd" />
            </svg>`;
    }
  }

  startObserver() {
    this.observer.observe(this.editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  stopObserver() {
    this.observer.disconnect();
  }

  toggleEditMode() {
    this.editMode = this.editMode === "chord" ? "text" : "chord";
    this.updateModeUI();
  }

  async acquireWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      } catch (err) {
        console.error(
          `Kunde inte skaffa skärmlås: ${err.name}, ${err.message}`
        );
      }
    } else {
      console.warn("Wake Lock API stöds inte i denna webbläsare.");
    }
  }

  async releaseWakeLock() {
    if (this.wakeLock !== null) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {
        console.error(
          `Kunde inte släppa skärmlås: ${err.name}, ${err.message}`
        );
      }
    }
  }

  handleVisibilityChange() {
    if (
      this.editMode === "scroll" &&
      document.visibilityState === "visible" &&
      !this.wakeLock
    ) {
      this.acquireWakeLock();
    }
  }

  // ***
  // *** VIKTIG UPPDATERING: setupEventListeners() ***
  // *** Kopplar nu alla nya knappar till sina modals
  // ***
  setupEventListeners() {
    this.floatingLiveBtn.addEventListener("click", () => {
      this.toggleScrollMode(true, true);
    });

    const toggleMenu = () => {
      this.sideMenu.classList.toggle("is-closed");
      this.menuOverlay.classList.toggle("is-closed");
    };
    this.hamburgerBtn.addEventListener("click", toggleMenu);
    this.menuOverlay.addEventListener("click", toggleMenu);

    this.titleInput.addEventListener("blur", async () => {
      const oldName = this.projectList.value;
      const newName = this.titleInput.value.trim();
      if (oldName && newName && oldName !== newName) {
        const confirmed = await this.showCustomConfirm(
          `Do you want to rename this project "${oldName}" till "${newName}"?`
        );
        if (confirmed) {
          this.renameProject(oldName, newName);
        } else {
          this.titleInput.value = oldName;
        }
      }
    });

    // Båda knapparna (topp-bar och sidomeny) gör samma sak
    this.btnToggleChordMode.addEventListener("click", () =>
      this.toggleEditMode()
    );
    this.mainToggleEditModeBtn.addEventListener("click", () =>
      this.toggleEditMode()
    );

    this.btnToggleScrollMode.addEventListener("click", () => {
      this.toggleScrollMode(true);
      if (!this.sideMenu.classList.contains("is-closed")) {
        toggleMenu();
      }
    });

    this.modalBtnClose.addEventListener("click", () =>
      this.closeChordModal()
    );
    this.modalBtnRemove.addEventListener("click", () =>
      this.removeChord()
    );

    // --- NYA MODAL-LYSSNARE ---
    const openModal = (modal) => modal.classList.add("visible");
    const closeModal = (modal) => modal.classList.remove("visible");

this.btnOpenTunerModal.addEventListener("click", () => {
      this.openTunerModal();
      toggleMenu();
    });
    this.tunerBtnClose.addEventListener("click", () =>
      this.closeTunerModal()
    );

    this.btnOpenTransposeModal.addEventListener("click", () => {
      openModal(this.transposeModal);
      toggleMenu();
    });
    this.transposeModalClose.addEventListener("click", () =>
      closeModal(this.transposeModal)
    );

    this.btnOpenSectionsModal.addEventListener("click", () => {
      openModal(this.sectionsModal);
      toggleMenu();
    });
    this.sectionsModalClose.addEventListener("click", () =>
      closeModal(this.sectionsModal)
    );

    this.btnOpenExportModal.addEventListener("click", () => {
      openModal(this.exportModal);
      toggleMenu();
    });
    this.exportModalClose.addEventListener("click", () =>
      closeModal(this.exportModal)
    );

    this.btnOpenImportModal.addEventListener("click", () => {
      openModal(this.importModal);
      toggleMenu();
    });
    this.importModalClose.addEventListener("click", () =>
      closeModal(this.importModal)
    );
    // --- SLUT PÅ NYA LYSSNARE ---

    document
      .getElementById("center-button")
      .addEventListener("click", () => {
        const finalChord = document.getElementById(
          "current-chord-display"
        ).textContent;
        document
          .getElementById("center-button")
          .classList.add("confirmed");
        document.getElementById("action-text").textContent = `USED`;
        this.applyChord(finalChord);
        setTimeout(() => {
          if (document.getElementById("action-text")) {
            document.getElementById("action-text").textContent = `USE`;
            document
              .getElementById("center-button")
              .classList.remove("confirmed");
          }
        }, 800);
      });

    this.scrollBtnExit.addEventListener("click", () =>
      this.toggleScrollMode(false)
    );

    this.editor.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link && link.href) {
        e.preventDefault();
        window.open(link.href, "_blank");
        return;
      }
      if (this.editMode !== "chord") return;
      const clickedChord = e.target.closest(".chord");
      if (clickedChord) {
        this.openChordModal(clickedChord, null);
      } else {
        const range = this.getWordAtCursor(e);
        if (range) this.openChordModal(null, range);
      }
    });
    this.editor.addEventListener(
      "keydown",
      this.handleKeyDown.bind(this)
    );
    this.editor.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData(
        "text/plain"
      );
      document.execCommand("insertText", false, text);
    });
    this.editor.addEventListener("input", () =>
      this.recordHistoryDebounced()
    );
    this.editor.addEventListener(
      "keyup",
      this.handleAutoLinking.bind(this)
    );
    this.editor.addEventListener(
      "dragover",
      this.handleDragOver.bind(this)
    );
    this.editor.addEventListener(
      "dragleave",
      () => (this.dropIndicator.style.display = "none")
    );
    this.editor.addEventListener("drop", this.handleDrop.bind(this));

    this.projectList.addEventListener("change", () => {
      const name = this.projectList.value || "";
      if (name) {
        this.loadProject(name);
      }
    });
    this.projectSelectorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleProjectMenu();
    });

    this.btnNewProject.addEventListener("click", async () => {
      if (
        await this.showCustomConfirm(
          "Are you sure? Unsaved changes will be lost!."
        )
      ) {
        this.createNewProject();
      }
    });
    this.btnSaveProject.addEventListener("click", () => {
      const name = this.titleInput.value.trim();
      if (!name) return this.showCustomAlert("Name your song.");
      this.saveProject(name);
    });
    this.btnDeleteProject.addEventListener("click", async () => {
      const name = this.projectList.value;
      if (!name)
        return this.showCustomAlert("Select a project to remove.");
      if (
        await this.showCustomConfirm(
          `Delete projeckt "${name}"? This cannot be undone!`
        )
      )
        this.deleteProject(name);
    });
    this.btnDeleteAllProjects.addEventListener("click", () =>
      this.deleteAllProjects()
    );
    this.btnTransposeUp.addEventListener("click", () =>
      this.transpose(1)
    );
    this.btnTransposeDown.addEventListener("click", () =>
      this.transpose(-1)
    );
    this.fontSizeSlider.addEventListener(
      "input",
      (e) => (this.editor.style.fontSize = e.target.value + "px")
    );
    this.btnExportPdf.addEventListener("click", () => this.exportPdf());
    this.btnExportTxt.addEventListener("click", () => this.exportTxt());
    this.btnExportZip.addEventListener("click", () =>
      this.exportAllAsZip()
    );
    this.btnToggleDarkMode.addEventListener("click", () =>
      this.toggleDarkMode()
    );
    this.btnShowHelp.addEventListener("click", () => {
      window.open(
        "https://gobonkers65.github.io/ProChorder/help",
        "_blank"
      );
    });
    this.btnExportJson.addEventListener("click", () => this.exportJson());
    this.btnExportAllJson.addEventListener("click", () =>
      this.exportAllJson()
    );
    this.btnImportJson.addEventListener("click", () =>
      this.fileImport.click()
    );
    this.fileImport.addEventListener("change", (e) =>
      this.importJsonFromFile(e.target.files[0])
    );
    this.btnImportUrl.addEventListener("click", async () => {
      const confirmed = await this.showCustomConfirm(
        "Ladda låtlista från GitHub? Lokala låtar med samma titel skrivs över."
      );
      if (confirmed) this.importJsonFromUrl(SHARED_SONG_LIST_URL);
    });
    this.scrollBtnPlayPause.addEventListener("click", () =>
      this.toggleScrolling()
    );
    this.scrollSpeedSlider.addEventListener("input", (e) => {
      this.setScrollSpeed(e.target.value);
      this.updateDurationFromSpeed();
    });
    const durationChangeHandler = () => {
      const totalSeconds = this.getTotalDurationSeconds();
      if (totalSeconds > 0) this.setScrollForDuration(totalSeconds);
    };
    this.scrollDurationMinutesInput.addEventListener(
      "input",
      durationChangeHandler
    );
    this.scrollDurationSecondsInput.addEventListener(
      "input",
      durationChangeHandler
    );
    this.scrollBtnPrev.addEventListener("click", () =>
      this.loadProjectByIndexDelta(-1)
    );
    this.scrollBtnNext.addEventListener("click", () =>
      this.loadProjectByIndexDelta(1)
    );

    document.addEventListener("keydown", (e) => {
      if (this.editMode === "scroll") {
        if (e.key === " ") {
          e.preventDefault();
          this.toggleScrolling();
        }
        if (e.key === "Escape") this.toggleScrollMode(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        this.undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.shiftKey && e.key === "Z"))
      ) {
        e.preventDefault();
        this.redo();
      }
    });
    document.addEventListener("click", (e) => this.handleOutsideClick(e));
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );

    this.btnInsertSection.addEventListener("click", () => {
      if (this.editMode === "scroll") return;
      const sectionType = this.sectionTypeSelect.value;
      if (sectionType) {
        this.insertSectionMarker(sectionType);
        this.recordHistoryDebounced();
        this.sectionTypeSelect.selectedIndex = 0;
      } else {
        this.showCustomAlert("Choose selection type");
      }
    });
  }
  toggleProjectMenu() {
    const isOpen = this.projectDropdownMenu.classList.toggle("is-open");
    this.projectSelectorBtn.classList.toggle("is-active", isOpen);
  }

  closeProjectMenu() {
    this.projectDropdownMenu.classList.remove("is-open");
    this.projectSelectorBtn.classList.remove("is-active");
  }

  handleOutsideClick(e) {
    if (
      this.projectDropdownMenu &&
      !this.projectSelectorBtn.contains(e.target) &&
      !this.projectDropdownMenu.contains(e.target)
    ) {
      this.closeProjectMenu();
    }

    // Stäng även modals om man klickar på overlayen
    const overlay = e.target.closest(".custom-dialog-overlay");
    if (overlay && e.target === overlay) {
      overlay.classList.remove("visible");
    }
  }

  selectProject(name) {
    this.loadProject(name);
    this.closeProjectMenu();
  }

  // ***
  // *** VIKTIG UPPDATERING: updateModeUI() ***
  // *** Uppdaterar nu den nya text-ikonen i sidomenyn
  // ***
  updateModeUI() {
    if (this.editMode === "chord") {
      if (this.chordModeIconText) this.chordModeIconText.textContent = "ON";
      if (this.mainToggleEditModeBtn) {
        this.mainToggleEditModeBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-medium">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>`;
        this.mainToggleEditModeBtn.title = "Edit Lyrics (C)";
      }
      this.editor.classList.remove("text-mode");
      this.editor.setAttribute("inputmode", "none");
    } else if (this.editMode === "text") {
      if (this.chordModeIconText) this.chordModeIconText.textContent = "OFF";
      if (this.mainToggleEditModeBtn) {
        this.mainToggleEditModeBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-medium">
                <path fill-rule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clip-rule="evenodd" />
              </svg>`;
        this.mainToggleEditModeBtn.title = "Edit Chord (L)";
      }
      this.editor.classList.add("text-mode");
      this.editor.setAttribute("inputmode", "text");
    }
  }

  toggleScrollMode(enter, startImmediately = false) {
    if (enter) {
      if (!this.editor.textContent.trim()) {
        this.showCustomAlert(
          "Lägg till text innan du startar Live Mode."
        );
        return;
      }
      this.acquireWakeLock();
      this.editMode = "scroll";
      this.editor.contentEditable = false;
      document.body.classList.add("scroll-mode-active");
      setTimeout(() => {
        const scrollHeight =
          this.editor.scrollHeight - this.editor.clientHeight;
        if (scrollHeight <= 0) {
          this.showCustomAlert("Texten är för kort för att scrolla.");
          this.toggleScrollMode(false);
          return;
        }
        if (startImmediately) {
          this.startScrolling();
        }
      }, 100);
    } else {
      this.releaseWakeLock();
      this.stopScrolling();
      this.editMode = "chord";
      this.editor.contentEditable = true;
      document.body.classList.remove("scroll-mode-active");
      this.updateModeUI();
    }
  }
  centerChordHandles() {
    this.editor.querySelectorAll(".chord").forEach((chordEl) => {
      const handle = chordEl.querySelector(".chord-handle");
      const text = chordEl.querySelector(".chord-text");
      if (handle && text) {
        const textWidth = text.offsetWidth;
        handle.style.left = `${textWidth / 2}px`;
      }
    });
  }
  positionItems(layerId, items, currentIndex, radiusMultiplier = 1) {
    const layer = document.getElementById(layerId);
    if (!layer) return;
    layer.innerHTML = "";
    const count = items.length;
    const radius = (layer.offsetWidth / 2) * radiusMultiplier;
    items.forEach((item, index) => {
      const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const div = document.createElement("div");
      div.className = "layer-item";
      let textToShow = item;
      if (item === "(root)") textToShow = "Ø";
      else if (item === "") textToShow = "Ø";
      div.textContent = textToShow;
      div.style.left = `${50 + (x / layer.offsetWidth) * 100}%`;
      div.style.top = `${50 + (y / layer.offsetHeight) * 100}%`;
      div.style.transform = "translate(-50%, -50%)";
      if (index === currentIndex) {
        div.classList.add("active");
      }
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        this.updateRadialSelection(layerId, index);
      });
      layer.appendChild(div);
    });
  }
  updateRadialSelection(layerId, newIndex) {
    if (layerId === "inner-layer") {
      this.radialState.rootIndex = newIndex;
      this.radialState.root = this.musicalNotes[newIndex];
    } else if (layerId === "middle-layer") {
      this.radialState.typeIndex = newIndex;
      this.radialState.type = this.radialTypes[newIndex];
    } else if (layerId === "outer-layer") {
      this.radialState.baseIndex = newIndex;
      this.radialState.base = this.radialBassNotes[newIndex];
    }
    this.renderRadialBuilder();
  }
  renderRadialBuilder() {
    let chordName = this.radialState.root + this.radialState.type;
    if (
      this.radialState.base !== this.radialState.root &&
      this.radialState.base !== "(root)"
    ) {
      chordName += "/" + this.radialState.base;
    }
    document.getElementById("current-chord-display").textContent =
      chordName;
    this.positionItems(
      "inner-layer",
      this.musicalNotes,
      this.radialState.rootIndex,
      0.85
    );
    this.positionItems(
      "middle-layer",
      this.radialTypes,
      this.radialState.typeIndex,
      0.88
    );
    this.positionItems(
      "outer-layer",
      this.radialBassNotes,
      this.radialState.baseIndex,
      0.92
    );
  }
  parseChordToRadialState(chordName) {
    const chordRegex = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;
    const parts = chordName.match(chordRegex);
    let root, type, base;
    if (parts) {
      root = parts[1];
      type = parts[2] || "";
      base = parts[3] || "(root)";
    } else {
      root = "C";
      type = "";
      base = "(root)";
    }
    const rootIndex = this.musicalNotes.indexOf(root);
    let typeIndex = this.radialTypes.indexOf(type);
    let baseIndex = this.radialBassNotes.indexOf(base);
    if (rootIndex === -1) rootIndex = 3;
    if (typeIndex === -1) typeIndex = 0;
    if (baseIndex === -1) baseIndex = 0;
    this.radialState = {
      root: this.musicalNotes[rootIndex],
      type: this.radialTypes[typeIndex],
      base: this.radialBassNotes[baseIndex],
      rootIndex,
      typeIndex,
      baseIndex,
    };
  }
  openChordModal(element, range) {
    this.currentlyEditing = { element, range };
    this.chordEditorModal.classList.add("visible");
    if (element) {
      const existingChord = element.dataset.chord;
      this.parseChordToRadialState(existingChord);
      this.modalBtnRemove.style.display = "inline-block";
    } else if (range) {
      this.parseChordToRadialState("C");
      this.modalBtnRemove.style.display = "none";
    }
    this.renderRadialBuilder();
  }
  applyChord(chordName) {
    if (!this.currentlyEditing) return;
    if (this.currentlyEditing.element) {
      const chordTextEl =
        this.currentlyEditing.element.querySelector(".chord-text");
      this.currentlyEditing.element.dataset.chord = chordName;
      if (chordTextEl) chordTextEl.textContent = chordName;
    } else if (this.currentlyEditing.range) {
      const range = this.currentlyEditing.range;
      const wordText = range.toString();
      range.deleteContents();
      const chordSpan = this.createChordSpan(chordName);
      range.insertNode(chordSpan);
      const textNode = document.createTextNode(" " + wordText);
      range.setStartAfter(chordSpan);
      range.insertNode(textNode);
    }
    this.centerChordHandles();
    this.recordHistoryDebounced();
    this.closeChordModal();
  }
  closeChordModal() {
    this.chordEditorModal.classList.remove("visible");
    this.currentlyEditing = null;
  }
  removeChord() {
    if (this.currentlyEditing?.element) {
      this.currentlyEditing.element.remove();
      this.recordHistoryDebounced();
    }
    this.closeChordModal();
  }
  getWordAtCursor(event) {
    let range = null;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(
        event.clientX,
        event.clientY
      );
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    }
    if (
      !range ||
      !range.startContainer.textContent ||
      range.startContainer.nodeType !== Node.TEXT_NODE
    ) {
      return null;
    }
    try {
      const text = range.startContainer.textContent;
      let startIndex = range.startOffset;
      let endIndex = range.startOffset;
      while (startIndex > 0 && text[startIndex - 1].trim() !== "") {
        startIndex--;
      }
      while (endIndex < text.length && text[endIndex].trim() !== "") {
        endIndex++;
      }
      if (startIndex === endIndex) {
        return null;
      }
      const wordRange = document.createRange();
      wordRange.setStart(range.startContainer, startIndex);
      wordRange.setEnd(range.startContainer, endIndex);
      return wordRange;
    } catch (e) {
      console.error("getWordAtCursor error:", e);
      return null;
    }
  }
  handleDragOver(e) {
    e.preventDefault();
    if (this.editMode !== "chord") return;
    if (e.ctrlKey || e.altKey) e.dataTransfer.dropEffect = "copy";
    else e.dataTransfer.dropEffect = "move";
    let range;
    if (document.caretRangeFromPoint)
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    else {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    }
    if (range) {
      const rect = range.getBoundingClientRect();
      this.dropIndicator.style.display = "block";
      this.dropIndicator.style.left = `${rect.left + window.scrollX}px`;
      this.dropIndicator.style.top = `${rect.top + window.scrollY}px`;
    }
  }
  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.dropIndicator.style.display = "none";
    if (this.editMode !== "chord") return;
    let range = null;
    if (document.caretRangeFromPoint)
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range || !this.editor.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(this.editor);
      range.collapse(false);
    }
    let chordNode;
    if ((e.ctrlKey || e.altKey) && this.draggedChord) {
      const chordText = this.draggedChord.dataset.chord;
      chordNode = this.createChordSpan(chordText);
    } else {
      chordNode = this.draggedChord
        ? this.draggedChord
        : this.createChordSpan(e.dataTransfer.getData("text/plain"));
    }
    chordNode.style.display = "inline-block";
    range.insertNode(chordNode);
    const sel = window.getSelection();
    sel.removeAllRanges();
    const after = document.createRange();
    after.setStartAfter(chordNode);
    after.collapse(true);
    sel.addRange(after);
    this.centerChordHandles();
    this.recordHistoryDebounced();
  }
  createChordSpan(chord) {
    const span = document.createElement("span");
    span.className = "chord";
    span.dataset.chord = chord;
    span.setAttribute("contenteditable", "false");
    const chordText = document.createElement("span");
    chordText.className = "chord-text";
    chordText.textContent = chord;
    chordText.spellcheck = false;
    span.appendChild(chordText);
    const handle = document.createElement("span");
    handle.className = "chord-handle";
    handle.draggable = true;
    span.appendChild(handle);
    span.addEventListener("click", (e) => {
      if (this.editMode !== "chord" || e.target === handle) return;
      e.stopPropagation();
      this.clearChordSelection();
      span.classList.add("selected");
    });
    span.addEventListener("dblclick", (e) => {
      if (this.editMode !== "chord") return;
      e.stopPropagation();
      span.remove();
      this.recordHistoryDebounced();
    });
    handle.addEventListener("dragstart", (e) => {
      if (this.editMode !== "chord") {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      e.dataTransfer.setData("text/plain", chord);
      e.dataTransfer.effectAllowed = "copyMove";
      this.draggedChord = span;
      document.body.classList.add("is-dragging");
      if (e.dataTransfer.setDragImage) {
        const ghost = document.createElement("span");
        ghost.textContent = chord;
        ghost.style.cssText = `display:inline-block;padding:0.1em 0.4em;border-radius:3px;background-color:${getComputedStyle(
          document.body
        ).getPropertyValue("--surface")};color:${getComputedStyle(
          document.body
        ).getPropertyValue(
          "--chord-color"
        )};font-family:var(--font-sans);font-weight:600;font-size:0.85em;border:1px solid ${getComputedStyle(
          document.body
        ).getPropertyValue(
          "--border"
        )};position:absolute;top:-9999px;left:-9999px;`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 10, 15);
        setTimeout(() => document.body.removeChild(ghost), 0);
      }
      const isCopy = e.ctrlKey || e.altKey;
      if (!isCopy) {
        setTimeout(() => {
          span.style.display = "none";
        }, 0);
      }
    });
    handle.addEventListener("dragend", (e) => {
      e.stopPropagation();
      document.body.classList.remove("is-dragging");
      if (this.draggedChord && this.draggedChord.parentNode) {
        this.draggedChord.style.display = "inline-block";
      }
      this.draggedChord = null;
    });
    return span;
  }
  insertSectionMarker(type) {
    if (this.editMode === "scroll") return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !this.editor.contains(sel.anchorNode))
      return this.showCustomAlert(
        "Place the marker on the row where yot want to insert the section marker."
      );
    let node = sel.anchorNode;
    while (node && node.parentNode !== this.editor)
      node = node.parentNode;
    if (!node || node.tagName !== "DIV") {
      const newDiv = document.createElement("div");
      this.editor.appendChild(newDiv);
      node = newDiv;
    }
    const existingMarker = node.querySelector(".section-marker");
    if (existingMarker) existingMarker.remove();
    this.insertSectionMarkerInDiv(node, type);
  }
  insertSectionMarkerInDiv(div, type) {
    const abbreviations = {
      Verse: "V", Chorus: "R", Stick: "S", Intro: "I", Outro: "O",
      Solo: "Solo", Bridge: "B", Dig: "M",
    };
    const markerSpan = document.createElement("span");
    markerSpan.className = "section-marker";
    markerSpan.dataset.section = type;
    markerSpan.setAttribute("contenteditable", "false");
    markerSpan.dataset.abbreviation =
      abbreviations[type] || type.charAt(0);
    const textSpan = document.createElement("span");
    textSpan.className = "section-marker-text";
    textSpan.textContent = type;
    markerSpan.appendChild(textSpan);
    div.insertBefore(markerSpan, div.firstChild);
    markerSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      markerSpan.remove();
      this.recordHistoryDebounced();
    });
  }
  clearChordSelection() {
    this.editor
      .querySelectorAll(".chord.selected")
      .forEach((s) => s.classList.remove("selected"));
  }
  handleKeyDown(e) {
    if (this.editMode !== "chord") return;
    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed && range.startOffset === 0) {
        const container = range.startContainer;
        const prev = (
          container.nodeType === Node.TEXT_NODE
            ? container
            : container.childNodes[range.startOffset] || null
        )?.previousSibling;
        if (
          prev &&
          prev.nodeType === Node.ELEMENT_NODE &&
          prev.classList.contains("chord")
        ) {
          e.preventDefault();
          prev.remove();
          this.recordHistoryDebounced();
        }
      }
    }
  }
  handleMutations(mutations) {
    this.stopObserver();
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData")
        this.formatNode(mutation.target);
      else if (mutation.type === "childList")
        mutation.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) this.formatNode(n);
        });
    });
    this.startObserver();
  }
  formatNode(node) {
    if (
      this.editMode !== "chord" ||
      !node.textContent ||
      !node.textContent.includes("[")
    )
      return;
    const text = node.textContent;
    const regex = /\[([^\]]+)\]/g;
    let match;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let replaced = false;
    while ((match = regex.exec(text)) !== null) {
      replaced = true;
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText)
        frag.appendChild(document.createTextNode(beforeText));
      const chord = match[1];
      const chordSpan = this.createChordSpan(chord);
      frag.appendChild(chordSpan);
      lastIndex = regex.lastIndex;
    }
    if (replaced) {
      const afterText = text.substring(lastIndex);
      if (afterText) frag.appendChild(document.createTextNode(afterText));
      if (node.parentNode) {
        const parent = node.parentNode;
        parent.replaceChild(frag, node);
        const sel = window.getSelection();
        const range = document.createRange();
        const lastNode = parent.childNodes[parent.childNodes.length - 1];
        if (lastNode) {
          range.setStart(
            lastNode,
            lastNode.length || lastNode.childNodes.length
          );
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        this.centerChordHandles();
      }
    }
  }
  syncChordData() {
    this.editor.querySelectorAll(".chord").forEach((chordEl) => {
      const chordTextEl = chordEl.querySelector(".chord-text");
      if (chordTextEl) chordEl.dataset.chord = chordTextEl.textContent;
    });
  }
  getContentAsText() {
    let result = [];
    this.editor.childNodes.forEach((lineDiv) => {
      let lineText = "";
      if (lineDiv.nodeType !== Node.ELEMENT_NODE) return;
      const marker = lineDiv.querySelector(".section-marker");
      if (marker) {
        lineText += `::${marker.dataset.section}::`;
      }
      lineDiv.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          lineText += node.textContent;
        } else if (node.matches && node.matches(".chord")) {
          lineText += `[${node.dataset.chord}]`;
        } else if (node.tagName === "A") {
          lineText += `[[${node.href}|${node.textContent}]]`;
        }
      });
      result.push(lineText);
    });
    return result.join("\n");
  }
  loadContent(text, recordHistory = false) {
    this.stopObserver();
    this.editor.innerHTML = "";
    const lines = text.split("\n");
    lines.forEach((lineText) => {
      lineText = lineText.replace(/\[\s*\]/g, "");
      const lineDiv = document.createElement("div");
      let sectionType = null;
      lineText = lineText.replace(/^::(.*?)::/, (match, type) => {
        sectionType = type;
        return "";
      });
      if (sectionType)
        this.insertSectionMarkerInDiv(lineDiv, sectionType);
      if (lineText.trim() === "" && !lineText.includes("[")) {
        lineDiv.appendChild(document.createElement("br"));
      } else {
        const regex = /\[\[(.+?)(?:\|(.*?))?\]\]|\[([^\]]+)\]/g;
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(lineText)) !== null) {
          if (match.index > lastIndex) {
            lineDiv.appendChild(
              document.createTextNode(
                lineText.substring(lastIndex, match.index)
              )
            );
          }
          if (match[1]) {
            const url = match[1].trim();
            const linkText = (match[2] || "").trim() || url;
            const link = document.createElement("a");
            link.href = url.startsWith("http") ? url : `http://${url}`;
            link.textContent = linkText;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            lineDiv.appendChild(link);
          } else if (match[3]) {
            lineDiv.appendChild(this.createChordSpan(match[3]));
          }
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < lineText.length) {
          lineDiv.appendChild(
            document.createTextNode(lineText.substring(lastIndex))
          );
        }
      }
      this.editor.appendChild(lineDiv);
    });
    this.centerChordHandles();
    this.startObserver();
    if (recordHistory) this.recordHistory();
  }
  _transposeSingleNote(note, steps) {
    const sharpMap = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
    const match = note.match(/^([A-G](?:#|b)?)/);
    if (!match) return note;
    let rootNote = match[0];
    let normalizedNote = rootNote.includes("b")
      ? sharpMap[rootNote] || rootNote
      : rootNote;
    const currentIndex = this.musicalNotes.indexOf(normalizedNote);
    if (currentIndex !== -1) {
      const newIndex =
        (currentIndex + steps + this.musicalNotes.length) %
        this.musicalNotes.length;
      const transposedRoot = this.musicalNotes[newIndex];
      return transposedRoot + note.substring(rootNote.length);
    }
    return note;
  }
  transpose(steps) {
    if (this.editMode === "scroll") return;
    this.syncChordData();
    const text = this.getContentAsText();
    const transposedText = text.replace(
      /\[([^\]]+)\]/g,
      (fullMatch, chord) => {
        const parts = chord.split("/");
        const mainChord = parts[0];
        const bassNote = parts.length > 1 ? parts[1] : null;
        const transposedMainChord = this._transposeSingleNote(
          mainChord,
          steps
        );
        if (bassNote) {
          const transposedBassNote = this._transposeSingleNote(
            bassNote,
            steps
          );
          return `[${transposedMainChord}/${transposedBassNote}]`;
        } else {
          return `[${transposedMainChord}]`;
        }
      }
    );
    this.loadContent(transposedText, true);
  }
  recordHistory() {
    this.syncChordData();
    const snapshot = this.getContentAsText();
    if (this.history[this.historyIndex] === snapshot) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > this.historyMax) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }
  recordHistoryDebounced() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.recordHistory(), 300);
  }
  undo() {
    if (this.editMode === "scroll") return;
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadContent(this.history[this.historyIndex], false);
    }
  }
  redo() {
    if (this.editMode === "scroll") return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadContent(this.history[this.historyIndex], false);
    }
  }
  showCustomAlert(message) {
    const dialog = document.getElementById("custom-alert");
    document.getElementById("custom-alert-message").textContent = message;
    dialog.classList.add("visible");
    const okBtn = document.getElementById("custom-alert-ok");
    const close = () => dialog.classList.remove("visible");
    okBtn.onclick = close;
  }
  showCustomConfirm(message) {
    return new Promise((resolve) => {
      const dialog = document.getElementById("custom-confirm");
      document.getElementById("custom-confirm-message").textContent =
        message;
      dialog.classList.add("visible");
      const okBtn = document.getElementById("custom-confirm-ok");
      const cancelBtn = document.getElementById("custom-confirm-cancel");
      const close = (value) => {
        dialog.classList.remove("visible");
        resolve(value);
      };
      okBtn.onclick = () => close(true);
      cancelBtn.onclick = () => close(false);
    });
  }
  toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    const isDarkMode = document.body.classList.contains("dark-mode");
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.DARK_MODE,
      isDarkMode ? "enabled" : "disabled"
    );
    this.applySavedTheme();
  }
  createNewProject() {
    this.titleInput.value = "";
    this.authorInput.value = "";
    this.loadContent(
      'Open the side panel, name your project then choose "Project" and save..Now you can replace this text whith your lyrics and chords...',
      true
    );
    this.projectList.selectedIndex = 0;
    this.currentProjectName.textContent = "Välj projekt...";
    localStorage.removeItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT);
    if (this.fontSizeSlider) {
      this.fontSizeSlider.value = 16;
    }
    this.editor.style.fontSize = "16px";
    this.titleInput.focus();
  }
  saveProject(name) {
    this.syncChordData();
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    projects[name] = {
      title: this.titleInput.value,
      author: this.authorInput.value,
      fontSize: this.editor.style.fontSize || "16px",
      content: this.getContentAsText(),
      scrollSpeed: this.scrollSpeed,
      duration: this.getTotalDurationSeconds(),
    };
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.LAST_PROJECT,
      name
    );
    this.updateProjectList(name);

    // Uppdatera "Save"-knappen
    const originalText = this.btnSaveProject.querySelector(".menu-grid-title").textContent;
    this.btnSaveProject.querySelector(".menu-grid-title").textContent = "Saved!";
    this.btnSaveProject.disabled = true;
    setTimeout(() => {
      this.btnSaveProject.querySelector(".menu-grid-title").textContent = "Save song";
      this.btnSaveProject.disabled = false;
    }, 1200);
  }
  loadProject(name) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    if (projects[name]) {
      const data = projects[name];
      this.titleInput.value = data.title || "";
      this.authorInput.value = data.author || "";
      this.editor.style.fontSize = data.fontSize || "16px";
      if (this.fontSizeSlider) {
        const num = parseInt((data.fontSize || "").replace("px", ""));
        if (!isNaN(num)) this.fontSizeSlider.value = num;
      }
      this.loadContent(data.content || "", true);
      if (data.scrollSpeed !== undefined) {
        const sliderVal =
          ((data.scrollSpeed - this.MIN_MOVE_SPEED) /
            (this.MAX_MOVE_SPEED - this.MIN_MOVE_SPEED)) *
          100;
        this.scrollSpeedSlider.value = Math.max(
          0,
          Math.min(100, Math.round(sliderVal))
        );
        this.setScrollSpeed(this.scrollSpeedSlider.value);
      } else {
        this.scrollSpeedSlider.value = 20;
        this.setScrollSpeed(20);
      }
      if (data.duration !== undefined) {
        this.updateDurationInputs(data.duration);
      } else {
        this.updateDurationFromSpeed();
      }
      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.LAST_PROJECT,
        name
      );
      if (this.projectList.value !== name) this.projectList.value = name;
      this.currentProjectName.textContent = name;
    }
  }
  loadProjectByIndexDelta(delta) {
    if (!this.projectList) return;

    const options = this.projectList.options;
    if (options.length <= 1) return; // Finns bara "Välj projekt..."

    const currentIndex = this.projectList.selectedIndex;
    let newIndex;

    if (currentIndex <= 0) {
      // Om ingen låt är vald (är på "Välj projekt..."),
      // gå till första (delta > 0) eller sista (delta < 0)
      newIndex = delta > 0 ? 1 : options.length - 1;
    } else {
      newIndex = currentIndex + delta;
    }

    // Hantera "wrap-around"
    // Ignorera index 0 ("Välj projekt...")
    if (newIndex >= options.length) {
      newIndex = 1; // Gå till första låten
    } else if (newIndex < 1) {
      newIndex = options.length - 1; // Gå till sista låten
    }

    const newProjectName = options[newIndex].value;
    if (newProjectName) {
      // Stoppa scrollningen om den är igång
      this.stopScrolling();
      
      // Ladda projektet direkt, utan varning
      this.loadProject(newProjectName);
    }
  }
  
  loadLastProject() {
    this.updateProjectList();
    const last = localStorage.getItem(
      StableChordEditor.STORAGE_KEYS.LAST_PROJECT
    );
    if (last) this.loadProject(last);
    else
      this.loadContent(
        "Welcome to ProChorder!\nIf this is your first time with ProChorder, please use the ?-button in the top menu.",
        true
      );
  }
  updateProjectList(selectedValue) {
    const list = this.projectList;
    const dropdown = this.projectDropdownMenu;
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    const currentProjects = Object.keys(projects).sort();
    list.innerHTML = '<option value="">Load project...</option>';
    dropdown.innerHTML = "";
    if (currentProjects.length === 0) {
      dropdown.innerHTML = `<div class="project-dropdown-item" style="opacity: 0.6; cursor: default;">Inga projekt sparade</div>`;
    }
    currentProjects.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      list.appendChild(option);
      const item = document.createElement("div");
      item.className = "project-dropdown-item";
      item.textContent = name;
      item.dataset.name = name;
      item.addEventListener("click", () => {
        this.selectProject(name);
      });
      dropdown.appendChild(item);
    });
    const last =
      selectedValue ||
      localStorage.getItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT);
    if (last && currentProjects.includes(last)) {
      list.value = last;
      this.currentProjectName.textContent = last;
    } else {
      list.value = "";
      this.currentProjectName.textContent = "Choose project...";
    }
  }
  deleteProject(name) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    delete projects[name];
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );
    const last = localStorage.getItem(
      StableChordEditor.STORAGE_KEYS.LAST_PROJECT
    );
    if (last === name) {
      localStorage.removeItem(
        StableChordEditor.STORAGE_KEYS.LAST_PROJECT
      );
      this.createNewProject();
    }
    this.updateProjectList();
    this.showCustomAlert(`Project "${name}" Removed.`);
  }
  async deleteAllProjects() {
    if (
      await this.showCustomConfirm(
        "Are you sure? This erase ALL songs permanently."
      )
    ) {
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECTS);
      localStorage.removeItem(
        StableChordEditor.STORAGE_KEYS.LAST_PROJECT
      );
      this.updateProjectList();
      this.createNewProject();
      this.showCustomAlert("All projects are removed.");
    }
  }
  async renameProject(oldName, newName) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    if (projects[oldName] && !projects[newName]) {
      projects[newName] = projects[oldName];
      projects[newName].title = newName;
      delete projects[oldName];
      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECTS,
        JSON.stringify(projects)
      );
      const lastProject = localStorage.getItem(
        StableChordEditor.STORAGE_KEYS.LAST_PROJECT
      );
      if (lastProject === oldName)
        localStorage.setItem(
          StableChordEditor.STORAGE_KEYS.LAST_PROJECT,
          newName
        );
      this.titleInput.value = newName;
      this.updateProjectList(newName);
      this.showCustomAlert(`This project is now renamed "${newName}".`);
    } else if (projects[newName]) {
      this.showCustomAlert(
        `A project called "${newName}" already exist.`
      );
      this.titleInput.value = oldName;
    }
  }
  generatePdfForProject(projectData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 20;
    const margin = 15;
    const baseFontSizePx = parseInt(
      (projectData.fontSize || "16px").replace("px", ""),
      10
    );
    const baseFontSizePt = baseFontSizePx * 0.75;
    const lyricLineHeightMultiplier = 0.7;
    const LYRIC_LINE_HEIGHT = baseFontSizePt * lyricLineHeightMultiplier;
    const SECTION_HEADER_LINE_HEIGHT = baseFontSizePt * 0.9;
    const CHORD_COLOR = "#0052cc";
    const TEXT_COLOR = "#172b4d";
    const CHORD_OFFSET = baseFontSizePt * 0.3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(projectData.title || "Song Title", 105, y, {
      align: "center",
    });
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(projectData.author || "Artist", 105, y, { align: "center" });
    y += 15;
    const lines = (projectData.content || "").split("\n");
    lines.forEach((lineText) => {
      let sectionType = null;
      let remainingText = lineText.replace(
        /^::(.*?)::/,
        (match, type) => {
          sectionType = type;
          return "";
        }
      );
      if (sectionType) {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        if (y > 25) y += SECTION_HEADER_LINE_HEIGHT * 0.5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(baseFontSizePt * 1.1);
        doc.setTextColor(TEXT_COLOR);
        doc.text(sectionType, margin, y);
        y += SECTION_HEADER_LINE_HEIGHT;
      }
      if (remainingText.trim()) {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        const parts = remainingText
          .split(/(\[[^\]]+\])/g)
          .filter((p) => p);
        let currentX = margin;
        parts.forEach((part) => {
          if (part.startsWith("[") && part.endsWith("]")) {
            const chord = part.substring(1, part.length - 1);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(baseFontSizePt * 0.85);
            doc.setTextColor(CHORD_COLOR);
            doc.text(chord, currentX, y - CHORD_OFFSET);
          } else {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(baseFontSizePt);
            doc.setTextColor(TEXT_COLOR);
            doc.text(part, currentX, y);
            currentX += doc.getTextWidth(part);
          }
        });
        y += LYRIC_LINE_HEIGHT;
      } else if (!sectionType) {
        y += LYRIC_LINE_HEIGHT * 0.7;
      }
    });
    return doc.output("blob");
  }
  exportPdf() {
    this.syncChordData();
    const projectData = {
      title: this.titleInput.value,
      author: this.authorInput.value,
      content: this.getContentAsText(),
      fontSize: this.editor.style.fontSize,
    };
    const pdfBlob = this.generatePdfForProject(projectData);
    saveAs(pdfBlob, `${this.sanitizeFilename(projectData.title)}.pdf`);
  }
  exportTxt() {
    this.syncChordData();
    const title = this.titleInput.value;
    const author = this.authorInput.value;
    const content = this.getContentAsText();
    const fullText = `${title}\n${author}\n\n${content}`;
    const blob = new Blob([fullText], {
      type: "text/plain;charset=utf-8",
    });
    saveAs(blob, `${this.sanitizeFilename(title)}.txt`);
  }
  async exportAllAsZip() {
    this.btnExportZip.textContent = "Generating...";
    this.btnExportZip.disabled = true;
    try {
      const projects =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
        ) || {};
      if (Object.keys(projects).length === 0)
        return this.showCustomAlert("No project to export.");
      const zip = new JSZip();
      for (const key in projects) {
        const project = projects[key];
        const pdfBlob = this.generatePdfForProject(project);
        zip.file(`${this.sanitizeFilename(project.title)}.pdf`, pdfBlob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "all songs.zip");
    } catch (e) {
      this.showCustomAlert("Fel vid ZIP-export.");
    } finally {
      this.btnExportZip.textContent = "ZIP";
      this.btnExportZip.disabled = false;
    }
  }
  exportJson() {
    this.syncChordData();
    const projectData = {
      title: this.titleInput.value,
      author: this.authorInput.value,
      content: this.getContentAsText(),
      fontSize: this.editor.style.fontSize,
      scrollSpeed: this.scrollSpeed,
      duration: this.getTotalDurationSeconds(),
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: "application/json",
    });
    saveAs(blob, `${this.sanitizeFilename(projectData.title)}.json`);
  }
  exportAllJson() {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    const projectsArray = Object.values(projects);
    const blob = new Blob([JSON.stringify(projectsArray, null, 2)], {
      type: "application/json",
    });
    saveAs(blob, `songs-backup.json`);
  }
  importJsonFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          if (
            await this.showCustomConfirm(
              `${data.length} Songs found. Would you like to import? Existing song with the same name will be over written.`
            )
          )
            this.importMultipleProjects(data);
        } else if (data.title) {
          this.importSingleProject(data);
        }
      } catch (e) {
        this.showCustomAlert("Import error.");
      }
    };
    reader.readAsText(file);
  }
  async importJsonFromUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      if (Array.isArray(data)) this.importMultipleProjects(data);
      else if (data.title) this.importSingleProject(data);
    } catch (e) {
      this.showCustomAlert("Import error.");
    }
  }
  importSingleProject(data) {
    this.titleInput.value = data.title || "";
    this.authorInput.value = data.author || "";
    this.editor.style.fontSize = data.fontSize || "16px";
    this.loadContent(data.content || "", true);
    if (data.scrollSpeed) this.scrollSpeed = data.scrollSpeed;
    if (data.duration) this.updateDurationInputs(data.duration);
    this.saveProject(data.title);
  }
  importMultipleProjects(projectsArray) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    let importedCount = 0,
      overwrittenCount = 0;
    for (const project of projectsArray) {
      if (project && project.title) {
        if (projects[project.title]) overwrittenCount++;
        else importedCount++;
        projects[project.title] = project;
      }
    }
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );
    this.updateProjectList();
    this.showCustomAlert(
      `${importedCount} New songs imported. ${overwrittenCount} songs updated.`
    );
    if (projectsArray.length > 0)
      this.loadProject(projectsArray[0].title);
  }
  sanitizeFilename(name) {
    return name.replace(/[\/\\?%*:|"<>]/g, "-") || "låt";
  }
  toggleScrolling() {
    if (this.scrollInterval) this.stopScrolling();
    else this.startScrolling();
  }

  startScrolling() {
    if (this.scrollInterval) return;
    if (this.scrollSpeed <= 0) {
      this.calculateAndSetScrollSpeed();
    }
    if (this.scrollSpeed <= 0) {
      return;
    }
    this.scrollBtnPlayPause.textContent = "❚❚";
    this.scrollRemainder = 0;
    const scroll = () => {
      this.scrollRemainder += this.scrollSpeed;
      const move = Math.floor(this.scrollRemainder);
      if (move > 0) {
        this.editor.scrollTop += move;
        this.scrollRemainder -= move;
      }
      if (
        this.editor.scrollTop + this.editor.clientHeight >=
        this.editor.scrollHeight
      ) {
        this.stopScrolling();
      } else {
        this.scrollInterval = requestAnimationFrame(scroll);
      }
    };
    this.scrollInterval = requestAnimationFrame(scroll);
  }

  stopScrolling() {
    if (this.scrollInterval) cancelAnimationFrame(this.scrollInterval);
    this.scrollInterval = null;
    this.scrollBtnPlayPause.textContent = "▶";
  }
  setScrollSpeed(value) {
    const val = parseFloat(value);
    if (val === 0) {
      this.scrollSpeed = 0;
      return;
    }
    this.scrollSpeed =
      this.MIN_MOVE_SPEED +
      (val / 100) * (this.MAX_MOVE_SPEED - this.MIN_MOVE_SPEED);
  }
  getTotalDurationSeconds() {
    const minutes = parseInt(this.scrollDurationMinutesInput.value) || 0;
    const seconds = parseInt(this.scrollDurationSecondsInput.value) || 0;
    return minutes * 60 + seconds;
  }
 updateDurationInputs(totalSeconds) {
  let minutes, seconds; // Deklarera variabler
  if (totalSeconds > 0) {
    minutes = Math.floor(totalSeconds / 60);
    seconds = totalSeconds % 60;
    this.scrollDurationMinutesInput.value = minutes;
    this.scrollDurationSecondsInput.value = seconds;
  } else {
    minutes = 4; // Sätt default-värden
    seconds = 0;
    this.scrollDurationMinutesInput.value = 4;
    this.scrollDurationSecondsInput.value = 0;
  }

  // --- NY KOD BÖRJAR HÄR ---
  // Uppdatera den nya text-displayen
  if (this.scrollDurationText) {
    // Formatera sekunder till två siffror (t.ex. "3:05" istället för "3:5")
    const formattedSeconds = String(seconds).padStart(2, '0');
    this.scrollDurationText.textContent = `${minutes}:${formattedSeconds}`;
  }
  }
  setScrollForDuration(durationSeconds) {
    setTimeout(() => {
      const scrollHeight = Math.max(
        1,
        this.editor.scrollHeight - this.editor.clientHeight
      );
      if (scrollHeight <= 0) return;
      const frames = Math.max(1, durationSeconds * 60);
      this.scrollSpeed = scrollHeight / frames;
      const percent = Math.round(
        ((this.scrollSpeed - 0.02) / (0.5 - 0.02)) * 100
      );
      this.scrollSpeedSlider.value = Math.max(0, Math.min(100, percent));
    }, 100);
  }
  updateDurationFromSpeed() {
    if (this.scrollSpeed < 0.001) return;
    const scrollHeight = Math.max(
      1,
      this.editor.scrollHeight - this.editor.clientHeight
    );
    if (scrollHeight <= 0) return;
    const durationSeconds = scrollHeight / (this.scrollSpeed * 60);
    this.updateDurationInputs(Math.round(durationSeconds));
  }
}

window.addEventListener("load", () => new StableChordEditor("editor"));
