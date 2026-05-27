/* * =========================================
 * JAVASCRIPT-FIL FÖR PROCHORDER
 * =========================================
 */

class StableChordEditor {
  static STORAGE_KEYS = {
    PROJECTS: "stableProjects",
    LAST_PROJECT: "lastProject",
    DARK_MODE: "darkMode",
    PROJECT_ORDER: "projectOrder",
  };

  // --- AUTH LOGIK ---

  async loginWithGoogle() {
    try {
      const { auth, googleProvider, signInWithPopup } = window.fb;
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Logged in user:", result.user.displayName);
      this.showCustomAlert(`Welcome ${result.user.displayName}!`);
    } catch (error) {
      console.error("Login error:", error);
      this.showCustomAlert("Could not sign in: " + error.message);
    }
  }

  async logout() {
    try {
      await window.fb.signOut(window.fb.auth);
      this.showCustomAlert("You have signed out.");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  /**
   * Hanterar automatisk omvandling av textlänkar till klickbara <a>-taggar.
   */
  handleAutoLinking(e) {
    if (e.key !== " " && e.key !== "Enter") return;
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;

    const textContent = container.textContent.substring(0, range.startOffset);
    const customLinkRegex = /\[\[(.+?)(?:\|(.*?))?\]\]\s*$/;
    const autoLinkRegex = /(?:^|\s)((?:https?:\/\/\S+|(?:www|ftp)\.\S+))\s*$/;

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

  // --- TUNER FUNKTIONALITET ---
  openTunerModal() {
    this.tunerModal.classList.add("visible");
    this.startTuner();
  }

  closeTunerModal() {
    this.tunerModal.classList.remove("visible");
    this.stopTuner();
  }

  async startTuner() {
    if (this.tunerIframe) {
      this.tunerIframe.src = "tuner/index.html";
    }
  }

  stopTuner() {
    if (this.tunerIframe) {
      this.tunerIframe.src = "about:blank";
    }
  }

  constructor(editorId) {
    this.editor = document.getElementById(editorId);
    this.editMode = "chord";
    this.isEditMode = false;
    this.draggedChord = null;
    this.scrollInterval = null;
    this.scrollSpeed = 0.2;
    this.history = [];
    this.historyIndex = -1;
    this.debounceTimer = null;
    this.currentlyEditing = null;
    this.loadedProjectName = null;

    this.btnExitSetlist = document.getElementById("btn-exit-setlist");
    // Avsluta Gig-läge
    // Avsluta Gig-läge
    if (this.btnExitSetlist) {
      this.btnExitSetlist.addEventListener("click", () => {
        this.activeSetlist = null;
        this.btnExitSetlist.classList.add("hidden");

        // --- LÄGG TILL DENNA RAD FÖR ATT VISA MENYN IGEN ---
        this.hamburgerBtn.classList.remove("hidden");

        this.updateProjectList();
        this.showCustomAlert("Gig mode ended. Your full library is back!");
      });
    }

    this.musicalNotes = [
      "A",
      "A#",
      "B",
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
    ];
    this.historyMax = 100;

    // --- METRONOM SETUP ---
    this.audioContext = null;
    this.metronomeRunning = false;
    this.metronomeInterval = null;
    this.tempo = 120; // BPM
    this.scheduleAheadTime = 0.1;
    this.nextNoteTime = 0.0;
    this.lookahead = 25.0;

    // --- SCROLL PARAMETRAR ---
    this.MIN_MOVE_SPEED = 0.02;
    this.MAX_MOVE_SPEED = 0.5;

    // --- RADIAL BUILDER DATA ---
    this.radialTypes = [
      "",
      "m",
      "6",
      "m6",
      "7",
      "m7",
      "9",
      "m9",
      "11",
      "m11",
      "maj7",
      "sus4",
      "dim",
      "aug",
    ];
    this.radialBassNotes = [
      "(root)",
      "A",
      "A#",
      "B",
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
    ];
    this.radialState = {
      root: "C",
      type: "",
      base: "(root)",
      rootIndex: 3,
      typeIndex: 0,
      baseIndex: 0,
    };

    this.selectElements(); // Här laddas alla knappar in
    this.wakeLock = null;
    this.observer = new MutationObserver(this.handleMutations.bind(this));

    // Nu är det säkert att köra init(), för knapparna finns!
    this.init();
  }

  selectElements() {
    // Toppmeny & Navigering
    this.hamburgerBtn = document.getElementById("hamburger-btn");
    this.sideMenu = document.getElementById("side-menu");
    this.menuOverlay = document.getElementById("menu-overlay");
    this.mainToggleEditModeBtn = document.getElementById(
      "main-toggle-edit-mode-btn"
    );
    this.btnShowHelp = document.getElementById("btn-show-help");
    this.btnToggleDarkMode = document.getElementById("btn-toggle-dark-mode");

    this.btnLoginGoogle = document.getElementById("btn-login-google");
    this.btnLogout = document.getElementById("btn-logout");
    this.authContainer = document.getElementById("auth-container");
    this.userNameDisplay = document.getElementById("user-name");
    this.userPhoto = document.getElementById("user-photo");

    // Setlist: Dela
    this.btnOpenCreateSetlist = document.getElementById(
      "btn-open-create-setlist"
    );
    this.createSetlistModal = document.getElementById("create-setlist-modal");
    this.btnGenerateSetlist = document.getElementById("btn-generate-setlist");
    this.createSetlistClose = document.getElementById("create-setlist-close");
    this.setlistSongList = document.getElementById("setlist-song-list");
    this.setlistCodeDisplay = document.getElementById("setlist-code-display");

    this.setlistSelectedList = document.getElementById("setlist-selected-list");
    this.setlistAvailableList = document.getElementById(
      "setlist-available-list"
    );
    this.selectedCount = document.getElementById("selected-count");

    // Setlist: Hämta
    this.btnOpenFetchSetlist = document.getElementById(
      "btn-open-fetch-setlist"
    );
    this.fetchSetlistModal = document.getElementById("fetch-setlist-modal");
    this.btnDownloadSetlist = document.getElementById("btn-download-setlist");
    this.fetchSetlistClose = document.getElementById("fetch-setlist-close");
    this.setlistCodeInput = document.getElementById("setlist-code-input");

    // Projekt/Sång väljare
    this.projectSelectorBtn = document.getElementById("project-selector-btn");
    this.currentProjectName = document.getElementById("current-project-name");
    this.projectList = document.getElementById("project-list");
    this.projectDropdownMenu = document.getElementById("project-dropdown-menu");
    this.btnNewProject = document.getElementById("btn-new-project");
    this.btnSaveCopy = document.getElementById("btn-save-copy");

    // Sång-metadata
    this.titleInput = document.getElementById("song-title");
    this.authorInput = document.getElementById("song-author");

    // Live-läge & Metronom
    this.btnToggleScrollMode = document.getElementById(
      "btn-toggle-scroll-mode"
    );
    this.btnToggleMetronome = document.getElementById("btn-toggle-metronome");
    this.metronomeBpmInput = document.getElementById("metronome-bpm-input");
    this.btnBpmUp = document.getElementById("btn-bpm-up");
    this.btnBpmDown = document.getElementById("btn-bpm-down");

    // Inställningar
    this.fontSizeSelector = document.getElementById("font-size-selector");

    // Sidomeny Grid-knappar
    this.tunerIframe = document.getElementById("tuner-iframe");
    this.btnOpenTunerModal = document.getElementById("btn-open-tuner-modal");
    this.btnOpenTransposeModal = document.getElementById(
      "btn-open-transpose-modal"
    );
    this.btnToggleChordMode = document.getElementById("btn-toggle-chord-mode");
    this.chordModeIconText = document.getElementById("chord-mode-icon-text");
    this.btnOpenSectionsModal = document.getElementById(
      "btn-open-sections-modal"
    );
    // Ändra dessa rader i selectElements():
    this.btnOpenBackupModal = document.getElementById("btn-open-backup-modal");
    this.btnOpenBandModal = document.getElementById("btn-open-band-modal");
    this.loginStatusDot = document.getElementById("login-status-dot");

    // Leta upp Modaler och ändra till detta:
    this.backupModal = document.getElementById("backup-modal");
    this.backupModalClose = document.getElementById("backup-modal-close");
    this.bandModal = document.getElementById("band-modal");
    this.bandModalClose = document.getElementById("band-modal-close");

    // Spara/Radera
    this.btnSaveProject = document.getElementById("btn-save-project");
    this.btnDeleteProject = document.getElementById("btn-delete-project");
    this.btnDeleteAllProjects = document.getElementById(
      "btn-delete-all-projects"
    );

    // Modaler
    this.tunerModal = document.getElementById("tuner-modal");
    this.tunerBtnClose = document.getElementById("tuner-btn-close");
    this.tunerDisplay = document.getElementById("tuner-display");

    this.transposeModal = document.getElementById("transpose-modal");
    this.transposeModalClose = document.getElementById("transpose-modal-close");
    this.btnTransposeUp = document.getElementById("btn-transpose-up");
    this.btnTransposeDown = document.getElementById("btn-transpose-down");

    this.sectionsModal = document.getElementById("sections-modal");
    this.sectionsModalClose = document.getElementById("sections-modal-close");
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

    this.fileImport = document.getElementById("file-import");

    // Ackord-byggare (Radial)
    this.chordEditorModal = document.getElementById("chord-editor-modal");
    this.modalBtnRemove = document.getElementById("modal-btn-remove");
    this.modalBtnClose = document.getElementById("modal-btn-close");

    // Scroll-kontroller
    this.scrollControls = document.getElementById("scroll-controls");
    this.scrollBtnPlayPause = document.getElementById("scroll-btn-play-pause");
    this.scrollDurationText = document.getElementById("scroll-duration-text");
    this.scrollBtnExit = document.getElementById("scroll-btn-exit");
    this.scrollSpeedSlider = document.getElementById("scroll-speed-slider");
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
    // -- NYA EDIT-LÄGET --
    this.btnMainEditToggle = document.getElementById("btn-main-edit-toggle");
    this.floatingToolbar = document.getElementById("floating-edit-toolbar");
  }

  init() {
    this.populateSelects();
    this.applySavedTheme();
    this.setupEventListeners();
    this.setupSwipeGestures();
    this.updateModeUI();
    this.updateDurationFromSpeed();
    this.startObserver();
    this.loadLastProject();
    this.updateBandUI();

    if (window.fb) {
      window.fb.onAuthStateChanged(window.fb.auth, (user) => {
        if (user) {
          // --- INLOGGAD ---
          this.userNameDisplay.textContent = user.displayName;
          this.userPhoto.src = user.photoURL;
          this.userPhoto.style.display = "block";

          this.btnLoginGoogle.classList.add("hidden");
          this.btnLogout.classList.remove("hidden");
          document.getElementById("user-info").classList.remove("hidden");

          if (this.loginStatusDot) {
            this.loginStatusDot.classList.remove("offline");
            this.loginStatusDot.classList.add("online");
            this.loginStatusDot.title = "Online (" + user.displayName + ")";
          }
          //olla om användaren tillhör ett band, SEDAN hämtar vi låtarna!
          this.checkUserBand(user.uid).then(() => {
            this.fetchSongsFromCloud();
          });
        } else {
          // --- UTLOGGAD ---
          this.userNameDisplay.textContent = "";
          this.userPhoto.style.display = "none";

          this.btnLoginGoogle.classList.remove("hidden");
          this.btnLogout.classList.add("hidden");
          document.getElementById("user-info").classList.add("hidden");

          if (this.loginStatusDot) {
            this.loginStatusDot.classList.remove("online");
            this.loginStatusDot.classList.add("offline");
            this.loginStatusDot.title = "Offline";
          }
        }
      });
    }
  }

  // --- SWIPE NAVIGERING ---
  setupSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;

    this.editor.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      },
      { passive: true }
    );

    this.editor.addEventListener(
      "touchend",
      (e) => {
        // NYTT: Stoppa swipen direkt om Edit-läget är på, eller om vi drar och släpper!
        if (this.isEditMode || document.body.classList.contains("is-dragging"))
          return;

        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
          if (diffX > 0) {
            this.loadProjectByIndexDelta(-1);
          } else {
            this.loadProjectByIndexDelta(1);
          }
        }
      },
      { passive: true }
    );
  }

  populateSelects() {
    const sectionData = [
      "Intro",
      "Verse",
      "Chorus",
      "Stick",
      "Bridge",
      "Solo",
      "Outro",
      "Dig",
    ];
    const populate = (sel, options, placeholder) => {
      if (!sel) return;
      sel.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
      options.forEach(
        (o) => (sel.innerHTML += `<option value="${o}">${o}</option>`)
      );
    };
    populate(this.sectionTypeSelect, sectionData, "Select section...");

    const sizes = [14, 16, 18, 20, 22, 24, 28, 32];
    if (this.fontSizeSelector) {
      this.fontSizeSelector.innerHTML = "";
      sizes.forEach((size) => {
        const option = document.createElement("option");
        option.value = size;
        option.textContent = size + " px";
        this.fontSizeSelector.appendChild(option);
      });
    }
  }

  applySavedTheme() {
    const isDarkMode =
      localStorage.getItem(StableChordEditor.STORAGE_KEYS.DARK_MODE) ===
      "enabled";

    // Moderna och snygga ikoner som matchar resten av appen!
    const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-medium"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-2.659l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>`;
    const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-medium"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>`;

    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      // Om mörkt läge är på, visa solen för att kunna byta tillbaka
      if (this.btnToggleDarkMode) this.btnToggleDarkMode.innerHTML = sunIcon;
    } else {
      document.body.classList.remove("dark-mode");
      // Om ljust läge är på, visa månen
      if (this.btnToggleDarkMode) this.btnToggleDarkMode.innerHTML = moonIcon;
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

  // Öppna/stäng den utfällbara sektionsmenyn
  toggleSectionMenu() {
    const menu = document.getElementById("section-type-toolbar");
    if (menu) menu.classList.toggle("is-hidden");
  }

  toggleEditMode() {
    // NYTT: Om Live-läget (scroll) är igång, stäng av det först!
    if (
      !this.isEditMode &&
      document.body.classList.contains("scroll-mode-active")
    ) {
      this.toggleScrollMode(false);
    }

    this.isEditMode = !this.isEditMode;

    if (this.isEditMode) {
      document.body.classList.add("edit-mode-on");
      this.floatingToolbar.classList.remove("is-hidden");

      // Tillåt redigering i alla containrar OCH rubrikerna
      this.editor
        .querySelectorAll(
          ".block-content, .block-badge, .song-header-title, .song-header-author"
        )
        .forEach((el) => (el.contentEditable = "true"));
    } else {
      document.body.classList.remove("edit-mode-on");
      this.floatingToolbar.classList.add("is-hidden");

      const secMenu = document.getElementById("section-type-toolbar");
      if (secMenu) secMenu.classList.add("is-hidden");

      // Lås redigeringen
      this.editor
// Lås redigeringen
      this.editor
        .querySelectorAll(
          ".block-content, .block-badge, .song-header-title, .song-header-author"
        )
        .forEach((el) => (el.contentEditable = "false"));

      // --- OFÖRSTÖRBAR SÖKNING AV TITEL OCH ARTIST ---
      const headerBlock = this.editor.querySelector(".song-header-block");
      let titleEl = this.editor.querySelector(".song-header-title");
      let authorEl = this.editor.querySelector(".song-header-author");

      // Failsafe: Om webbläsaren raderat klasserna, ta barn 1 och 2 i blocket!
      if (!titleEl && headerBlock && headerBlock.children.length > 0) {
        titleEl = headerBlock.children[0];
      }
      if (!authorEl && headerBlock && headerBlock.children.length > 1) {
        authorEl = headerBlock.children[1];
      }

      if (titleEl) {
        const trimmedTitle = titleEl.textContent.trim();
        if (!trimmedTitle) {
          this.showCustomAlert("Song title cannot be empty!");
          titleEl.textContent = this.loadedProjectName || "Untitled song";
          this.titleInput.value = titleEl.textContent;
        } else {
          this.titleInput.value = trimmedTitle;
        }
      }

      if (authorEl) this.authorInput.value = authorEl.textContent.trim();

      if (this.titleInput.value) {
        this.saveProject(this.titleInput.value);
      }
    }
  }

  // --- LÄGG TILL ETT CONTAINER-BLOCK ---
  addBlock(type, contentHTML = "<br>", autoFocus = true) {
    const block = document.createElement("div");
    block.className = "song-block";
    block.dataset.type = type;

    const headerRow = document.createElement("div");
    headerRow.className = "song-block-header";

    const badge = document.createElement("div");
    badge.className = "block-badge";
    badge.textContent = type;
    badge.contentEditable = this.isEditMode ? "true" : "false";
    badge.spellcheck = false;

    // --- SKAPA KONTROLLER (Flytta, Kopiera, Radera) ---
    const controls = document.createElement("div");
    controls.className = "block-controls";

    // Flytta UPP
    const btnUp = document.createElement("button");
    btnUp.className = "block-control-btn";
    btnUp.innerHTML = "↑";
    btnUp.onclick = () => this.moveBlock(block, -1);

    // Flytta NER
    const btnDown = document.createElement("button");
    btnDown.className = "block-control-btn";
    btnDown.innerHTML = "↓";
    btnDown.onclick = () => this.moveBlock(block, 1);

    // KOPIERA Sektionen
    const btnCopy = document.createElement("button");
    btnCopy.className = "block-control-btn";
    btnCopy.innerHTML = "⧉";
    btnCopy.onclick = () => {
      // Kopierar det exakta innehållet i blocket (inkl ackord)
      const currentContent = block.querySelector(".block-content").innerHTML;
      const newBlock = this.addBlock(type, currentContent);
      block.after(newBlock); // Lägg inkopian direkt under!
    };

    // RADERA Sektionen
    const btnDel = document.createElement("button");
    btnDel.className = "block-control-btn delete-btn";
    btnDel.innerHTML = "✕";
    btnDel.onclick = () => {
      if (confirm("Delete this section?")) block.remove();
    };

    controls.appendChild(btnUp);
    controls.appendChild(btnDown);
    controls.appendChild(btnCopy);
    controls.appendChild(btnDel);

    headerRow.appendChild(badge);
    headerRow.appendChild(controls);

    const content = document.createElement("div");
    content.className = "block-content";
    content.contentEditable = this.isEditMode ? "true" : "false";
    content.innerHTML = contentHTML;

    // --- NYTT: VÄCK UPP SPÖK-ACKORD OCH MARKÖRER ---
    // När vi laddar från minnet eller kopierar ett block förloras event-lyssnarna.
    // Vi letar upp alla "döda" ackord och byter ut dem mot nya, fungerande!
    content.querySelectorAll(".chord").forEach((chordEl) => {
      const chordName = chordEl.dataset.chord;
      if (chordName) {
        const liveChord = this.createChordSpan(chordName);
        chordEl.replaceWith(liveChord);
      }
    });

    // Reparera dubbelklick (radera) på sektionsmarkörer också
    content.querySelectorAll(".section-marker").forEach((markerEl) => {
      markerEl.addEventListener("dblclick", (e) => {
        if (this.editMode !== "chord" || !this.isEditMode) return;
        e.stopPropagation();
        markerEl.remove();
        this.recordHistoryDebounced();
      });
    });
    // ------------------------------------------------

    block.appendChild(headerRow);
    block.appendChild(content);

    // Placera blocket i editorn
    this.editor.appendChild(block);

    // Fokusera och stäng menyn (om vi inte bygger en hel låt i bakgrunden)
    if (this.isEditMode && autoFocus) content.focus();
    const secMenu = document.getElementById("section-type-toolbar");
    if (secMenu) secMenu.classList.add("is-hidden");

    return block;
  }

  // --- FLYTTA LOGIK ---
  moveBlock(block, direction) {
    if (direction === -1 && block.previousElementSibling) {
      // Flytta upp (före föregående block)
      block.parentNode.insertBefore(block, block.previousElementSibling);
    } else if (direction === 1 && block.nextElementSibling) {
      // Flytta ner (efter nästa block)
      block.parentNode.insertBefore(block.nextElementSibling, block);
    }
  }

  toggleChordsOnly() {
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

  setupEventListeners() {
    const toggleMenu = () => {
      const isOpening = this.sideMenu.classList.contains("is-closed");

      this.sideMenu.classList.toggle("is-closed");
      this.menuOverlay.classList.toggle("is-closed");

      if (isOpening) {
        this.floatingToolbar.classList.add("is-hidden");
      } else {
        if (this.isEditMode) {
          this.floatingToolbar.classList.remove("is-hidden");
        }
      }
    };

    this.hamburgerBtn.addEventListener("click", toggleMenu);
    this.menuOverlay.addEventListener("click", toggleMenu);

    this.btnToggleChordMode.addEventListener("click", () =>
      this.toggleChordsOnly()
    );

    if (this.btnMainEditToggle) {
      this.btnMainEditToggle.addEventListener("click", () =>
        this.toggleEditMode()
      );
    }

    this.btnShowHelp.addEventListener("click", () => {
      toggleMenu();
      window.open("https://gobonkers65.github.io/ProChorder/help", "_blank");
    });

    if (this.btnToggleDarkMode) {
      this.btnToggleDarkMode.addEventListener("click", () =>
        this.toggleDarkMode()
      );
    }

    this.floatingLiveBtn.addEventListener("click", () => {
      this.toggleScrollMode(true, true);
    });

    this.scrollBtnExit.addEventListener("click", () =>
      this.toggleScrollMode(false)
    );
    this.scrollBtnPlayPause.addEventListener("click", () =>
      this.toggleScrolling()
    );

    this.titleInput.addEventListener("input", () => this.updateEditorHeader());
    this.authorInput.addEventListener("input", () => this.updateEditorHeader());

    // ... resten av din kod fortsätter här ...

    this.btnShowHelp.addEventListener("click", () => {
      toggleMenu();
      window.open("https://gobonkers65.github.io/ProChorder/help", "_blank");
    });

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

    this.btnToggleMetronome.addEventListener("click", () =>
      this.toggleMetronome()
    );

    this.metronomeBpmInput.addEventListener("input", (e) => {
      let newTempo = parseInt(e.target.value);
      const min = parseInt(e.target.min) || 40;
      const max = parseInt(e.target.max) || 300;

      if (newTempo >= min && newTempo <= max) {
        this.tempo = newTempo;
        if (this.metronomeRunning && this.audioContext?.state === "suspended") {
          this.audioContext.resume();
        }
      }
    });

    this.metronomeBpmInput.addEventListener("blur", (e) => {
      if (!e.target.value || e.target.value < 40) {
        e.target.value = this.tempo;
      }
    });

    const updateBpm = (delta) => {
      const min = parseInt(this.metronomeBpmInput.min) || 40;
      const max = parseInt(this.metronomeBpmInput.max) || 300;
      let newTempo = this.tempo + delta;
      if (newTempo >= min && newTempo <= max) {
        this.tempo = newTempo;
        this.metronomeBpmInput.value = newTempo;
      }
    };
    this.btnBpmUp.addEventListener("click", () => updateBpm(1));
    this.btnBpmDown.addEventListener("click", () => updateBpm(-1));

    this.projectList.addEventListener("change", () => {
      const name = this.projectList.value || "";
      if (name) this.loadProject(name);
    });
    this.projectSelectorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleProjectMenu();
    });

    this.btnNewProject.addEventListener("click", async () => {
      toggleMenu();
      if (
        await this.showCustomConfirm(
          "Are you sure? Unsaved changes will be lost."
        )
      ) {
        this.createNewProject();
      }
    });

    this.btnSaveCopy.addEventListener("click", async () => {
      toggleMenu();
      this.saveCopy();
    });

    this.btnSaveProject.addEventListener("click", () => {
      // Synka alltid från DOM först — titleInput kan vara tomt om användaren skrivit direkt i editorn
      const titleEl = this.editor.querySelector(".song-header-title");
      const authorEl = this.editor.querySelector(".song-header-author");
      if (titleEl) this.titleInput.value = titleEl.textContent.trim();
      if (authorEl) this.authorInput.value = authorEl.textContent.trim();

      const name = this.titleInput.value.trim();
      if (!name) return this.showCustomAlert("Please name your song first.");
      this.saveProject(name);
    });

    this.btnDeleteProject.addEventListener("click", async () => {
      toggleMenu();
      const name = this.projectList.value;
      if (!name) return this.showCustomAlert("Select a song to delete.");
      this.deleteProject(name);
    });

    this.btnDeleteAllProjects.addEventListener("click", () => {
      toggleMenu();
      this.deleteAllProjects();
    });

    const openModal = (modal) => modal.classList.add("visible");
    const closeModal = (modal) => modal.classList.remove("visible");

    this.btnOpenTunerModal.addEventListener("click", () => {
      this.openTunerModal();
      toggleMenu();
    });

    this.tunerBtnClose.addEventListener("click", () => this.closeTunerModal());

    this.btnOpenBackupModal.addEventListener("click", () => {
      openModal(this.backupModal);
      toggleMenu();
    });
    this.backupModalClose.addEventListener("click", () =>
      closeModal(this.backupModal)
    );

    this.btnOpenBandModal.addEventListener("click", () => {
      openModal(this.bandModal);
      toggleMenu();
    });
    this.bandModalClose.addEventListener("click", () =>
      closeModal(this.bandModal)
    );

    this.btnExportPdf.addEventListener("click", () => this.exportPdf());
    this.btnExportTxt.addEventListener("click", () => this.exportTxt());
    this.btnExportZip.addEventListener("click", () => this.exportAllAsZip());
    this.btnExportJson.addEventListener("click", () => this.exportJson());
    this.btnExportAllJson.addEventListener("click", () => this.exportAllJson());

    this.btnImportJson.addEventListener("click", () => this.fileImport.click());
    this.fileImport.addEventListener("change", (e) =>
      this.importJsonFromFile(e.target.files[0])
    );

    this.fontSizeSelector.addEventListener("change", (e) => {
      this.editor.style.fontSize = e.target.value + "px";
      this.recordHistoryDebounced();
    });

    this.editor.addEventListener("click", (e) => {
      // NYTT: Blockera ackordväljaren om man klickar på rubriker eller småknapparna!
      if (e.target.closest(".song-block-header")) return;

      const link = e.target.closest("a");
      if (link && link.href) {
        e.preventDefault();
        window.open(link.href, "_blank");
        return;
      }
      if (this.editMode !== "chord" || !this.isEditMode) return;
      const clickedChord = e.target.closest(".chord");
      if (clickedChord) {
        this.openChordModal(clickedChord, null);
      } else {
        const range = this.getWordAtCursor(e);
        if (range) this.openChordModal(null, range);
      }
    });

    // -- SETLIST EVENTS --

    // Öppna Dela Setlist
    this.btnOpenCreateSetlist.addEventListener("click", () => {
      this.populateSetlistOptions();
      openModal(this.createSetlistModal);
      toggleMenu();
    });
    this.createSetlistClose.addEventListener("click", () =>
      closeModal(this.createSetlistModal)
    );

    // Öppna Hämta Setlist
    this.btnOpenFetchSetlist.addEventListener("click", () => {
      openModal(this.fetchSetlistModal);
      toggleMenu();
    });
    this.fetchSetlistClose.addEventListener("click", () =>
      closeModal(this.fetchSetlistModal)
    );

    // Skapa och hämta klick
    this.btnGenerateSetlist.addEventListener("click", () =>
      this.generateSetlist()
    );
    this.btnDownloadSetlist.addEventListener("click", () =>
      this.fetchSharedSetlist()
    );

    this.editor.addEventListener("keydown", this.handleKeyDown.bind(this));

    this.editor.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData(
        "text/plain"
      );
      const processedText = this.processSmartPaste(text);
      document.execCommand("insertText", false, processedText);
    });

    this.editor.addEventListener("input", (e) => {
      // Synka rubrikerna i realtid
      if (e.target.classList.contains("song-header-title")) {
        this.titleInput.value = e.target.textContent;
      }
      if (e.target.classList.contains("song-header-author")) {
        this.authorInput.value = e.target.textContent;
      }
      this.recordHistoryDebounced();
    });

    // Synka titel/artist från editorn + fråga om namnbyte
    // Synka title/author från editorn till de dolda inputfälten
    this.editor.addEventListener("focusout", (e) => {
      if (e.target.classList.contains("song-header-title")) {
        this.titleInput.value = e.target.textContent.trim();
      }
      if (e.target.classList.contains("song-header-author")) {
        this.authorInput.value = e.target.textContent.trim();
      }
    });
    this.editor.addEventListener("keyup", this.handleAutoLinking.bind(this));

    this.editor.addEventListener("dragover", this.handleDragOver.bind(this));
    this.editor.addEventListener(
      "dragleave",
      () => (this.dropIndicator.style.display = "none")
    );
    this.editor.addEventListener("drop", this.handleDrop.bind(this));

    this.modalBtnClose.addEventListener("click", () => this.closeChordModal());
    this.modalBtnRemove.addEventListener("click", () => this.removeChord());

    document.getElementById("center-button").addEventListener("click", () => {
      const finalChord = document.getElementById(
        "current-chord-display"
      ).textContent;
      document.getElementById("center-button").classList.add("confirmed");
      document.getElementById("action-text").textContent = `SELECTED`;
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
    //  Logga in med Google
    this.btnLoginGoogle.addEventListener("click", () => this.loginWithGoogle());
    this.btnLogout.addEventListener("click", () => this.logout());

    // Lyssna på om användaren loggar in/ut (Firebase auth state)
    //  if (window.fbAuth) {
    //   const { onAuthStateChanged } = window.fbAuth; // Vi hämtar funktionen från fönstret
    // Men vänta, vi behöver importera rätt funktioner först...
    //  }
  }

  // --- METRONOM LOGIK ---
  toggleMetronome() {
    if (!this.metronomeRunning) {
      this.startMetronome();
    } else {
      this.stopMetronome();
    }
  }

  async startMetronome() {
    if (this.metronomeRunning) return;

    if (!this.audioContext) {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.metronomeRunning = true;
    this.nextNoteTime = this.audioContext.currentTime;
    this.metronomeInterval = setInterval(
      () => this.scheduler(),
      this.lookahead
    );
    this.btnToggleMetronome.classList.add("is-active");
  }

  stopMetronome() {
    if (!this.metronomeRunning) return;

    clearInterval(this.metronomeInterval);
    this.metronomeRunning = false;
    this.btnToggleMetronome.classList.remove("is-active");
  }

  scheduler() {
    while (
      this.nextNoteTime <
      this.audioContext.currentTime + this.scheduleAheadTime
    ) {
      this.playMetronomeClick(this.nextNoteTime);

      const timeUntilBeat =
        (this.nextNoteTime - this.audioContext.currentTime) * 1000;

      setTimeout(() => {
        if (this.btnToggleMetronome) {
          // JS Animation istället för CSS
          this.btnToggleMetronome.animate(
            [
              { transform: "scale(0.9)", filter: "brightness(1.5)" },
              { transform: "scale(1.1)", offset: 0.5 },
              { transform: "scale(1)", filter: "brightness(1)" },
            ],
            {
              duration: 150,
              easing: "ease-out",
            }
          );
        }
      }, Math.max(0, timeUntilBeat));

      let secondsPerBeat = 60.0 / this.tempo;
      this.nextNoteTime += secondsPerBeat;
    }
  }

  playMetronomeClick(time) {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(880, time);
    gainNode.gain.setValueAtTime(1, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    oscillator.start(time);
    oscillator.stop(time + 0.05);
  }

  // --- PROJEKT MENY ---
  // --- PROJEKT MENY ---
toggleProjectMenu() {
    const isOpen = this.projectDropdownMenu.classList.toggle("is-open");
    this.projectSelectorBtn.classList.toggle("is-active", isOpen);

    if (isOpen) {
      this.editor.classList.add("scroll-locked");
      // (Snapshot-koden är borttagen härifrån för att stoppa falska larm)
    } else {
      this.editor.classList.remove("scroll-locked");
      // Kolla om något ändrats manuellt när menyn STÄNGS
      this.checkAndSyncOrderChanges();
    }
  }

  closeProjectMenu() {
    // Förhindra att den körs om menyn redan är stängd
    if (!this.projectDropdownMenu.classList.contains("is-open")) return;

    this.projectDropdownMenu.classList.remove("is-open");
    this.projectSelectorBtn.classList.remove("is-active");
    this.editor.classList.remove("scroll-locked");

    // NYTT: Kolla om något ändrats när menyn STÄNGS genom att man klickar utanför
    this.checkAndSyncOrderChanges();
  }

  // NYTT: Kollar om listan ändrats sedan vi öppnade menyn
async checkAndSyncOrderChanges() {
    // Kör bara om vi är i ett band och inte i ett tillfälligt setlist-läge
    if (!this.currentBandId || this.activeSetlist) return;

    // Har användaren MANUELLT dragit och släppt en låt?
    if (this.hasManuallyReordered) {
      const newOrder =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
        ) || [];

      const confirmed = await this.showCustomConfirm(
        "Change song order for all?"
      );
      if (confirmed) {
        this.syncOrderToCloud(newOrder);
      }

      // Nollställ flaggan inför nästa gång
      this.hasManuallyReordered = false;
    }
  }

  handleOutsideClick(e) {
    if (
      this.projectDropdownMenu &&
      !this.projectSelectorBtn.contains(e.target) &&
      !this.projectDropdownMenu.contains(e.target)
    ) {
      this.closeProjectMenu();
    }

    const overlay = e.target.closest(".custom-dialog-overlay");
    if (overlay && e.target === overlay) {
      overlay.classList.remove("visible");
    }
  }

  selectProject(name) {
    this.loadProject(name);
    this.closeProjectMenu();
  }

  // --- UPPDATERAD LOGIK FÖR KNAPP & SÅNGARLÄGE ---
  updateModeUI() {
    if (this.editMode === "chord") {
      // GUL KNAPP = CHORD MODE (Visa ackord)
      if (this.chordModeIconText) this.chordModeIconText.textContent = "ON";
      document.body.classList.remove("lyrics-only"); // Visa ackord
    } else {
      // GRÅ KNAPP = TEXT MODE / LYRICS MODE (Dölj ackord)
      if (this.chordModeIconText) this.chordModeIconText.textContent = "OFF";
      document.body.classList.add("lyrics-only"); // Dölj ackord
    }

    if (this.mainToggleEditModeBtn) {
      this.mainToggleEditModeBtn.classList.toggle(
        "is-active",
        this.editMode === "chord"
      );
      this.mainToggleEditModeBtn.title =
        this.editMode === "chord"
          ? "Chord Mode ON (Edit chords)"
          : "Chord Mode OFF (Singer mode - Text only)";
    }

    if (this.editMode === "chord") {
      this.editor.classList.remove("text-mode");
      this.editor.setAttribute("inputmode", "none");
    } else if (this.editMode === "text") {
      this.editor.classList.add("text-mode");
      this.editor.setAttribute("inputmode", "text");
    }
  }

  toggleScrollMode(enter, startImmediately = false) {
    if (enter) {
      // NYTT: Om Edit-läget är igång, stäng det och spara först!
      if (this.isEditMode) {
        this.toggleEditMode();
      }

      this.previousEditMode = this.editMode;

      if (!this.editor.textContent.trim()) {
        this.showCustomAlert("Please add some text before starting Live Mode.");
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
          this.showCustomAlert("The text is too short to scroll.");
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

      this.editMode = this.previousEditMode || "chord";

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

  // --- RADIAL BUILDER LOGIK ---
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
    document.getElementById("current-chord-display").textContent = chordName;
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

    let rootIndex = this.musicalNotes.indexOf(root);
    let typeIndex = this.radialTypes.indexOf(type);
    let baseIndex = this.radialBassNotes.indexOf(base);

    if (rootIndex === -1) rootIndex = 3; // Default C
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

  // --- TEXT MARKÖR HANTERING ---
  getWordAtCursor(event) {
    let range = null;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
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

      if (startIndex === endIndex) return null;

      const wordRange = document.createRange();
      wordRange.setStart(range.startContainer, startIndex);
      wordRange.setEnd(range.startContainer, endIndex);
      return wordRange;
    } catch (e) {
      console.error("Error getWordAtCursor:", e);
      return null;
    }
  }

  handleDragOver(e) {
    e.preventDefault();
    if (this.editMode !== "chord" || !this.isEditMode) return;
    if (e.ctrlKey || e.altKey) e.dataTransfer.dropEffect = "copy";
    else e.dataTransfer.dropEffect = "move";

    let range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else {
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
    if (this.editMode !== "chord" || !this.isEditMode) return;

    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (document.caretPositionFromPoint) {
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
    chordText.draggable = true;
    span.appendChild(chordText);

    span.addEventListener("click", (e) => {
      if (this.editMode !== "chord" || !this.isEditMode) return;
      this.clearChordSelection();
      span.classList.add("selected");
    });

    span.addEventListener("dblclick", (e) => {
      if (this.editMode !== "chord" || !this.isEditMode) return;
      e.stopPropagation();
      span.remove();
      this.recordHistoryDebounced();
    });

    chordText.addEventListener("dragstart", (e) => {
      if (this.editMode !== "chord" || !this.isEditMode) {
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

    chordText.addEventListener("dragend", (e) => {
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
        "Place the cursor on the line where you want to insert the section marker."
      );

    let node = sel.anchorNode;
    while (node && node.parentNode !== this.editor) node = node.parentNode;

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
      Verse: "V",
      Chorus: "R",
      Stick: "S",
      Intro: "I",
      Outro: "O",
      Solo: "Solo",
      Bridge: "B",
      Dig: "M",
    };
    const markerSpan = document.createElement("span");
    markerSpan.className = "section-marker";
    markerSpan.dataset.section = type;
    markerSpan.setAttribute("contenteditable", "false");
    markerSpan.dataset.abbreviation = abbreviations[type] || type.charAt(0);

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

  // --- SÄKER REDIGERING & ENTER-FIX ---
handleKeyDown(e) {
    // --- 1. SÄKERHET FÖR RUBRIKERNA (Körs ALLTID, oavsett läge!) ---
    if (
      e.target.classList.contains("song-header-title") ||
      e.target.classList.contains("song-header-author")
    ) {
      // Förhindra Enter (radbrytningar)
      if (e.key === "Enter") {
        e.preventDefault();
        e.target.blur(); // Triggar sparningen
        return;
      }

      // Förhindra webbläsaren från att radera själva HTML-elementet och sabba formateringen
      if (e.key === "Backspace" || e.key === "Delete") {
        const sel = window.getSelection();
        const text = e.target.textContent;

        // Om all text är markerad, ELLER om det bara är ett tecken kvar
        if (sel.toString() === text || (text.length === 1 && e.key === "Backspace")) {
          e.preventDefault(); // Stoppa webbläsarens destruktiva beteende
          e.target.textContent = ""; // Töm texten manuellt istället
          return;
        }
      }
    }

    // --- 2. Avbryt om vi är i text-läge (men EFTER rubrik-skyddet!) ---
    if (this.editMode !== "chord") return;

if (e.key === "Enter" && !e.shiftKey) {
      // LÄGG TILL DESSA TRE RADER: Hämtar markörens position!
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      let div = range.startContainer;
      while (div && div.nodeName !== "DIV" && div.id !== "editor") {
        div = div.parentNode;
      }

      if (div && div.querySelector(".section-marker")) {
        e.preventDefault();

        const newDiv = document.createElement("div");
        const rangeAfter = range.cloneRange();
        rangeAfter.setEndAfter(div.lastChild);
        const content = rangeAfter.extractContents();

        newDiv.appendChild(content);
        if (newDiv.innerHTML.trim() === "") newDiv.innerHTML = "<br>";

        div.after(newDiv);

        const newRange = document.createRange();
        newRange.setStart(newDiv, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        this.recordHistoryDebounced();
        return;
      }
    }

    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      if (range.collapsed && range.startOffset === 0) {
        const container = range.startContainer;
        let prevNode = null;
        if (container.nodeType === Node.TEXT_NODE) {
          prevNode = container.previousSibling;
        } else if (container.nodeType === Node.ELEMENT_NODE) {
          prevNode = container.childNodes[range.startOffset - 1];
        }

        if (prevNode && prevNode.nodeType === Node.ELEMENT_NODE) {
          if (
            prevNode.classList.contains("chord") ||
            prevNode.classList.contains("section-marker")
          ) {
            e.preventDefault();
            this.showCustomAlert(
              "Use double-click or the menu to remove chords/sections."
            );
            return;
          }
        }
      }
    }
  }

  handleMutations(mutations) {
    this.stopObserver();
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") this.formatNode(mutation.target);
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
      if (beforeText) frag.appendChild(document.createTextNode(beforeText));

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

  // LÄSER AV EDITORN OCH SPARAR TILL JSON (Nu stöder den Block!)
  getContentAsText() {
    let result = [];
    this.editor.childNodes.forEach((node) => {
      if (node.id === "song-header") return; // NYTT: Ignorera låtrubriken vid sparning!
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      // Om det är ett NYTT Block
      if (node.classList.contains("song-block")) {
        // NYTT: Hämta det faktiska namnet från rubriken (så att "Verse 1" sparas istället för "Verse")
        const badgeElement = node.querySelector(".block-badge");
        const currentType = badgeElement
          ? badgeElement.textContent.trim()
          : node.dataset.type || "Custom";
        result.push(`::${currentType}::`);

        const contentDiv = node.querySelector(".block-content");
        if (contentDiv) {
          contentDiv.childNodes.forEach((child) => {
            let lineText = "";
            if (child.nodeType === Node.TEXT_NODE) {
              lineText += child.textContent;
            } else if (child.tagName === "BR") {
              // Tom rad
            } else if (child.tagName === "DIV") {
              // Text på ny rad i ett block
              child.childNodes.forEach((c) => {
                if (c.nodeType === Node.TEXT_NODE) lineText += c.textContent;
                else if (c.matches && c.matches(".chord"))
                  lineText += `[${c.dataset.chord}]`;
                else if (c.tagName === "A")
                  lineText += `[[${c.href}|${c.textContent}]]`;
              });
            } else if (child.matches && child.matches(".chord")) {
              lineText += `[${child.dataset.chord}]`;
            } else if (child.tagName === "A") {
              lineText += `[[${child.href}|${child.textContent}]]`;
            }

            if (
              child.tagName === "DIV" ||
              lineText.trim() !== "" ||
              lineText.includes("[")
            ) {
              result.push(lineText);
            } else if (child.tagName === "BR") {
              result.push(""); // Skapa en blank rad för <br>
            }
          });
        }
        return;
      }

      // Gammal logik för lösa rader (bakåtkompatibilitet för gamla låtar)
      let lineText = "";
      const marker = node.querySelector(".section-marker");
      if (marker) lineText += `::${marker.dataset.section}::`;

      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          lineText += child.textContent;
        } else if (child.matches && child.matches(".chord")) {
          lineText += `[${child.dataset.chord}]`;
        } else if (child.tagName === "A") {
          lineText += `[[${child.href}|${child.textContent}]]`;
        }
      });
      if (lineText) result.push(lineText);
    });
    return result.join("\n");
  }
  // Ritar ut Låtnamn och Artist högst upp på pappret
  updateEditorHeader() {
    let header = this.editor.querySelector("#song-header");
    if (!header) {
      header = document.createElement("div");
      header.id = "song-header";
      header.className = "song-header-block";
      this.editor.prepend(header);
    }

    // Sätt aldrig contentEditable på containern — det stör barnens redigering
    header.removeAttribute("contenteditable");

    // Kollar om edit-läget är igång just nu
    const isEditable = this.isEditMode ? "true" : "false";

    // Spara befintliga värden från DOM om de redan finns (undvik att skriva över pågående redigering)
    const existingTitle = this.editor.querySelector(".song-header-title");
    const existingAuthor = this.editor.querySelector(".song-header-author");
    const currentTitle = existingTitle
      ? existingTitle.textContent
      : this.titleInput.value;
    const currentAuthor = existingAuthor
      ? existingAuthor.textContent
      : this.authorInput.value;

    header.innerHTML = `
      <h1 class="song-header-title" contenteditable="${isEditable}" spellcheck="false">${
      currentTitle || ""
    }</h1>
      <h3 class="song-header-author" contenteditable="${isEditable}" spellcheck="false">${
      currentAuthor || ""
    }</h3>
    `;

    // Synka tillbaka till de dolda inputfälten
    this.titleInput.value = currentTitle || "";
    this.authorInput.value = currentAuthor || "";
  }
  // LADDAR IN LÅTEN PÅ SKÄRMEN I DOM NYA BLOCKEN
  loadContent(text, recordHistory = false) {
    this.stopObserver();
    this.editor.innerHTML = "";

    // 1. Tvättar bort osynliga \r-tecken från Windows
    const lines = text.replace(/\r/g, "").split("\n");

    let currentBlockContent = document.createElement("div");
    let currentType = null;

    const flushBlock = () => {
      if (currentType || currentBlockContent.innerHTML !== "") {
        const html = currentBlockContent.innerHTML || "<br>";
        this.addBlock(currentType || "Verse", html, false);
        currentBlockContent.innerHTML = "";
        currentType = null;
      }
    };

    lines.forEach((lineText) => {
      lineText = lineText.replace(/\[\s*\]/g, "");

      let sectionType = null;
      let remainingText = lineText.replace(/^::(.*?)::/, (match, type) => {
        sectionType = type;
        return "";
      });

      if (sectionType) {
        flushBlock();
        currentType = sectionType;
      }

      // 2. Den nya, korrekta hanteringen av helt tomma rader i block-systemet
      if (remainingText.trim() === "" && !remainingText.includes("[")) {
        if (!sectionType) {
          const emptyLine = document.createElement("div");
          emptyLine.appendChild(document.createElement("br"));
          currentBlockContent.appendChild(emptyLine);
        }
        return;
      }

      // ... (Här fortsätter resten av din kod som bygger upp ackord och text) ...

      // Analysera texten och återskapa ackorden
      const lineDiv = document.createElement("div");
      const regex = /\[\[(.+?)(?:\|(.*?))?\]\]|\[([^\]]+)\]/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(remainingText)) !== null) {
        if (match.index > lastIndex) {
          lineDiv.appendChild(
            document.createTextNode(
              remainingText.substring(lastIndex, match.index)
            )
          );
        }
        if (match[1]) {
          // Det var en länk
          const url = match[1].trim();
          const link = document.createElement("a");
          link.href = url.startsWith("http") ? url : `http://${url}`;
          link.textContent = (match[2] || "").trim() || url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          lineDiv.appendChild(link);
        } else if (match[3]) {
          // Det var ett ackord
          lineDiv.appendChild(this.createChordSpan(match[3]));
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < remainingText.length) {
        lineDiv.appendChild(
          document.createTextNode(remainingText.substring(lastIndex))
        );
      }

      currentBlockContent.appendChild(lineDiv);
    });

    // Glöm inte trycka in sista blocket
    flushBlock();
    this.updateEditorHeader();
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
    const transposedText = text.replace(/\[([^\]]+)\]/g, (fullMatch, chord) => {
      const parts = chord.split("/");
      const mainChord = parts[0];
      const bassNote = parts.length > 1 ? parts[1] : null;
      const transposedMainChord = this._transposeSingleNote(mainChord, steps);
      if (bassNote) {
        const transposedBassNote = this._transposeSingleNote(bassNote, steps);
        return `[${transposedMainChord}/${transposedBassNote}]`;
      } else {
        return `[${transposedMainChord}]`;
      }
    });
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
      document.getElementById("custom-confirm-message").textContent = message;
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

  async createNewProject() {
    // 1. Skapa ett unikt namn (som Google Drive: Untitled song, Untitled song (1) etc.)
    let baseName = "Untitled song";
    let newName = baseName;
    let counter = 1;
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};

    while (projects[newName]) {
      newName = `${baseName} (${counter})`;
      counter++;
    }

    // 2. Sätt de nya standardvärdena
    this.loadedProjectName = null;
    this.titleInput.value = newName;
    this.authorInput.value = "Unknown artist";
    this.editor.style.fontSize = "16px";

    // Återställ till textläge (inte ackordsläge) för ny låt
    if (this.editMode === "chord") {
      this.editMode = "text";
      this.updateModeUI();
    }

    // Ladda in start-texten
    this.loadContent(
      "Replace this text with your own lyrics and chords...",
      true
    );

    // 3. SPARA DIREKT (Låten skapas i biblioteket och molnet i bakgrunden)
    await this.saveProject(newName);

    // Slå på Edit-läget automatiskt om det inte redan är igång
    if (!this.isEditMode) {
      this.toggleEditMode();
    }

    // 4. UX-MAGI: Markera hela titeln så man bara kan börja skriva direkt!
    setTimeout(() => {
      const titleEl = this.editor.querySelector(".song-header-title");
      if (titleEl) {
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        titleEl.focus();
      }
    }, 50);
  }

  saveCopy() {
    const currentName = this.titleInput.value.trim();
    if (!currentName) {
      this.showCustomAlert("Cannot copy an unnamed song!");
      return;
    }
    const newName = currentName + " - Copy";
    this.titleInput.value = newName;
    this.loadedProjectName = null; // Tvinga kopian att bli en ny fil
    this.saveProject(newName);
    this.showCustomAlert(`Created a copy: "${newName}"`);
  }

  async saveProject(name) {
    this.syncChordData();
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};

    // --- SMART NAMNBYTE ---
    const oldName = this.loadedProjectName;
    const isRenaming = oldName && oldName !== name;

    // Förhindra att man skriver över en ANNAN befintlig låt när man byter namn
    if (isRenaming && projects[name]) {
      this.showCustomAlert(`A song named "${name}" already exists.`); // Översatt till engelska!
      const titleEl = this.editor.querySelector(".song-header-title");
      if (titleEl) titleEl.textContent = oldName;
      this.titleInput.value = oldName;
      return;
    }

    const projectData = {
      title: this.titleInput.value,
      author: this.authorInput.value,
      fontSize: this.editor.style.fontSize || "16px",
      content: this.getContentAsText(),
      scrollSpeed: this.scrollSpeed,
      duration: this.getTotalDurationSeconds(),
      tempo: this.tempo,
    };

    let order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];

    if (isRenaming) {
      delete projects[oldName];
      const index = order.indexOf(oldName);
      if (index !== -1) {
        order[index] = name;
      } else {
        order.push(name);
      }
    } else {
      if (!order.includes(name)) {
        order.push(name);
      }
    }

    projects[name] = projectData;
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
      JSON.stringify(order)
    );
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );
    localStorage.setItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT, name);

    this.loadedProjectName = name;
    this.updateProjectList(name);

    // --- NYTT: Synka ordningen till molnet omedelbart så bandet får det nya namnet! ---
    if (this.currentBandId || (window.fb && window.fb.auth.currentUser)) {
      this.syncOrderToCloud(order);
    }

    // --- FIRESTORE LOGIK (Spara och städa) ---
    if (window.fb && window.fb.auth.currentUser) {
      try {
        const uid = window.fb.auth.currentUser.uid;
        const { db, doc, setDoc, deleteDoc } = window.fb;
        const songRef = this.currentBandId
          ? doc(db, "bands", this.currentBandId, "songs", name)
          : doc(db, "users", uid, "songs", name);
        await setDoc(songRef, {
          ...projectData,
          updatedAt: new Date().toISOString(),
        });
        if (isRenaming) {
          const oldRef = this.currentBandId
            ? doc(db, "bands", this.currentBandId, "songs", oldName)
            : doc(db, "users", uid, "songs", oldName);
          await deleteDoc(oldRef);
        }
        console.log(`The song "${name}" was saved to the cloud!`); // Översatt!
      } catch (error) {
        console.error("Could not save to the cloud:", error); // Översatt!
        this.showCustomAlert("Saved locally, but cloud sync failed."); // Översatt!
      }
    }

    // --- VISUELL FEEDBACK ---
    if (this.btnSaveProject) {
      const titleSpan = this.btnSaveProject.querySelector(".menu-grid-title");
      if (titleSpan) titleSpan.textContent = "Saved!";
      this.btnSaveProject.disabled = true;
      setTimeout(() => {
        if (titleSpan) titleSpan.textContent = "Save song";
        this.btnSaveProject.disabled = false;
      }, 1500);
    }
    if (this.btnMainEditToggle && !this.isEditMode) {
      this.btnMainEditToggle.textContent = "✓";
      this.btnMainEditToggle.style.backgroundColor = "var(--success-bg)";
      this.btnMainEditToggle.style.borderColor = "var(--success-bg)";
      this.btnMainEditToggle.style.color = "#ffffff";
      setTimeout(() => {
        this.btnMainEditToggle.textContent = "EDIT";
        this.btnMainEditToggle.style.backgroundColor = "";
        this.btnMainEditToggle.style.borderColor = "";
        this.btnMainEditToggle.style.color = "";
      }, 1500);
    }
  } // <--- Här slutar funktionen saveProject

  async fetchSongsFromCloud() {
    if (!window.fb || !window.fb.auth.currentUser) return;

    const uid = window.fb.auth.currentUser.uid;
    // NYTT: Hämtar in 'doc' så vi kan lyssna på meta-dokumentet
    const { db, collection, onSnapshot, doc } = window.fb;

    const songsRef = this.currentBandId
      ? collection(db, "bands", this.currentBandId, "songs")
      : collection(db, "users", uid, "songs");

    if (this.cloudListener) {
      this.cloudListener();
    }
    if (this.orderListener) {
      this.orderListener();
    }

    // --- 1. DEN TYSTA LYSSNAREN FÖR LÅTORDNINGEN ---
    // Peka på exakt samma rot-dokument som syncOrderToCloud använder!
    const targetRef = this.currentBandId
      ? doc(db, "bands", this.currentBandId)
      : doc(db, "users", uid);

    this.orderListener = onSnapshot(targetRef, (snap) => {
      // Kolla efter "songOrder" istället för "order"
      if (snap.exists() && snap.data().songOrder) {
        const cloudOrder = snap.data().songOrder;
        const localOrder =
          JSON.parse(
            localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
          ) || [];

        // Uppdatera skärmen automatiskt i bakgrunden om ordningen ändrats!
        if (JSON.stringify(cloudOrder) !== JSON.stringify(localOrder)) {
          localStorage.setItem(
            StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
            JSON.stringify(cloudOrder)
          );
          this.updateProjectList(this.titleInput.value);
        }
      }
    });

    // --- 2. DEN BEFINTLIGA LYSSNAREN FÖR SJÄLVA LÅTARNA ---
    this.cloudListener = onSnapshot(songsRef, (snapshot) => {
      const localProjects =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
        ) || {};
      let localOrder =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
        ) || [];
      let needsRefresh = false;

      snapshot.docChanges().forEach((change) => {
        const songData = change.doc.data();
        const songTitle = change.doc.id;

        if (change.type === "added" || change.type === "modified") {
          localProjects[songTitle] = songData;
          if (!localOrder.includes(songTitle)) {
            localOrder.push(songTitle);
          }

          const currentViewTitle = (this.titleInput.value || "")
            .trim()
            .toLowerCase();
          const incomingTitle = (songTitle || "").trim().toLowerCase();

          if (
            currentViewTitle !== "" &&
            currentViewTitle === incomingTitle &&
            !this.isEditMode
          ) {
            needsRefresh = true;
          }
        }

        if (change.type === "removed") {
          const deletedIndex = localOrder.indexOf(songTitle);
          delete localProjects[songTitle];
          localOrder = localOrder.filter((t) => t !== songTitle);

          const currentViewTitle = (this.titleInput.value || "")
            .trim()
            .toLowerCase();
          const incomingTitle = (songTitle || "").trim().toLowerCase();

          if (currentViewTitle !== "" && currentViewTitle === incomingTitle) {
            // Stäng edit-läget om det är på
            if (this.isEditMode) this.toggleEditMode();

            // Navigera till närmaste låt, eller skapa ny om listan är tom
            if (localOrder.length > 0) {
              const nextIndex = Math.min(deletedIndex, localOrder.length - 1);
              this.loadProject(localOrder[nextIndex]);
            } else {
              this.createNewProject();
            }
          }
        }
      });

      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECTS,
        JSON.stringify(localProjects)
      );
      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
        JSON.stringify(localOrder)
      );

      this.updateProjectList(this.titleInput.value);

      if (needsRefresh) {
        this.loadProject(this.titleInput.value);

        if (this.btnMainEditToggle) {
          const origText = this.btnMainEditToggle.textContent;
          this.btnMainEditToggle.textContent = "SYNCED!";
          this.btnMainEditToggle.style.backgroundColor = "var(--success-bg)";
          this.btnMainEditToggle.style.color = "#ffffff";

          // --- NYTT: Göm ringen och ge plats åt texten ---
          this.btnMainEditToggle.style.borderColor = "transparent";
          this.btnMainEditToggle.style.width = "auto";
          this.btnMainEditToggle.style.padding = "0 12px";
          this.btnMainEditToggle.style.borderRadius = "20px";

          setTimeout(() => {
            this.btnMainEditToggle.textContent = origText;
            this.btnMainEditToggle.style.backgroundColor = "";
            this.btnMainEditToggle.style.color = "";
          }, 2000);
        }
      }
    });
  }

  loadProject(name) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    if (projects[name]) {
      this.loadedProjectName = name;
      const data = projects[name];
      this.titleInput.value = data.title || "";
      this.authorInput.value = data.author || "";
      this.editor.style.fontSize = data.fontSize || "16px";

      this.loadContent(data.content || "", true);
      this.editor.scrollTop = 0;

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

      this.tempo = data.tempo || 120;
      if (this.metronomeBpmInput) {
        this.metronomeBpmInput.value = this.tempo;
      }

      if (this.fontSizeSelector && data.fontSize) {
        this.fontSizeSelector.value = parseInt(
          (data.fontSize || "16px").replace("px", "")
        );
        this.editor.style.fontSize = data.fontSize;
      }

      localStorage.setItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT, name);
      if (this.projectList.value !== name) this.projectList.value = name;
      this.currentProjectName.textContent = name;
    }
  }

  loadProjectByIndexDelta(delta) {
    if (!this.projectList) return;
    const options = this.projectList.options;
    if (options.length <= 1) return;

    const currentIndex = this.projectList.selectedIndex;
    let newIndex;

    if (currentIndex <= 0) {
      newIndex = delta > 0 ? 1 : options.length - 1;
    } else {
      newIndex = currentIndex + delta;
    }

    if (newIndex >= options.length) {
      newIndex = 1;
    } else if (newIndex < 1) {
      newIndex = options.length - 1;
    }

    const newProjectName = options[newIndex].value;
    if (newProjectName) {
      this.stopScrolling();
      this.loadProject(newProjectName);
    }
  }

  loadLastProject() {
    this.updateProjectList();

    const order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];

    if (order.length > 0) {
      // Ladda alltid första låten vid start, aldrig i edit-läge
      this.loadProject(order[0]);
      if (this.isEditMode) this.toggleEditMode();
    } else {
      // Inga låtar — visa ny tom låt
      this.createNewProject();
    }
  }

  async syncOrderToCloud(order) {
    if (!window.fb || !window.fb.auth.currentUser) return;
    const uid = window.fb.auth.currentUser.uid;
    const { db, doc, setDoc } = window.fb;

    // 1. Peka direkt på rot-dokumentet för Bandet (eller dig själv om du kör solo)
    const targetRef = this.currentBandId
      ? doc(db, "bands", this.currentBandId)
      : doc(db, "users", uid);

    try {
      // 2. Använd { merge: true } så att vi bara uppdaterar låtlistan
      // och inte råkar skriva över bandets namn eller medlemmar!
      await setDoc(
        targetRef,
        {
          songOrder: order,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log("Song order synced to the cloud!");
    } catch (e) {
      console.error("Could not sync the song order:", e);
      this.showCustomAlert("Could not sync order to the cloud.");
    }
  }

  updateProjectList(selectedValue) {
    const list = this.projectList;
    const dropdown = this.projectDropdownMenu;
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};

    let order;

    // 1. Kolla om vi är i "Gig-läge"
    if (this.activeSetlist && this.activeSetlist.length > 0) {
      order = [...this.activeSetlist];
      this.projectSelectorBtn.style.border = "2px solid var(--danger-bg)"; // Gör rutan röd för att visa att läget är låst
    } else {
      // 2. Annars, hämta hela biblioteket som vanligt
      order =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
        ) || [];
      const projectKeys = Object.keys(projects);
      order = order.filter((name) => projectKeys.includes(name));
      projectKeys.forEach((name) => {
        if (!order.includes(name)) order.push(name);
      });
      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
        JSON.stringify(order)
      );
      this.projectSelectorBtn.style.border = ""; // Återställ utseendet
    }

    list.innerHTML = '<option value="">Load song...</option>';
    dropdown.innerHTML = "";

    if (order.length === 0) {
      dropdown.innerHTML = `<div class="project-dropdown-item" style="opacity: 0.6; cursor: default;">No projects saved</div>`;
    }

    order.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      list.appendChild(option);

      const item = document.createElement("div");
      item.className = "project-dropdown-item";
      item.dataset.name = name;

      const textSpan = document.createElement("span");
      textSpan.textContent = name;
      textSpan.style.pointerEvents = "none";
      textSpan.style.flexGrow = "1";

      const handle = document.createElement("span");
      handle.innerHTML = "&#9776;";
      handle.className = "drag-handle";
      handle.draggable = true;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".drag-handle")) return;
        this.selectProject(name);
      });

      handle.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
        document.body.classList.add("is-dragging");
      });

      handle.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        document.body.classList.remove("is-dragging");
        document
          .querySelectorAll(".project-dropdown-item")
          .forEach((el) => el.classList.remove("drag-over"));
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        item.classList.add("drag-over");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });

item.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
        const toIndex = index;

        if (fromIndex !== toIndex && !isNaN(fromIndex)) {
          const itemToMove = order[fromIndex];
          order.splice(fromIndex, 1);
          order.splice(toIndex, 0, itemToMove);

          if (this.activeSetlist) {
            this.activeSetlist = order;
          } else {
            // Spara bara tyst lokalt (vi kollar moln-synken när menyn stängs istället!)
            localStorage.setItem(
              StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
              JSON.stringify(order)
            );
            // --- NYTT: Aktivera flaggan för att användaren har bytt ordning! ---
            this.hasManuallyReordered = true;
          }
          this.updateProjectList(selectedValue);
        }
      });

      item.appendChild(textSpan);
      item.appendChild(handle);
      dropdown.appendChild(item);
    });

    const last =
      selectedValue ||
      (this.activeSetlist
        ? this.activeSetlist[0]
        : localStorage.getItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT));
    if (last && projects[last]) {
      list.value = last;
      this.currentProjectName.textContent = last;
    } else {
      list.value = "";
      this.currentProjectName.textContent = "Chose song...";
    }
  }

  async deleteProject(projectName = null) {
    // Kollar om vi raderar från en lista eller den aktiva låten
    const nameToDelete = projectName || this.titleInput.value;
    if (!nameToDelete) return;

    const confirmed = await this.showCustomConfirm(
      `Are you sure you want to delete "${nameToDelete}"?`
    );
    if (!confirmed) return;

    // 1. Radera från det lokala minnet i webbläsaren
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    delete projects[nameToDelete];
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );

    let order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];
    const deletedIndex = order.indexOf(nameToDelete); // Spara index INNAN filter
    order = order.filter((title) => title !== nameToDelete);
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
      JSON.stringify(order)
    );

    // 2. Radera från Firebase (kollar automatiskt om du är i ett band eller solo)
    if (window.fb && window.fb.auth.currentUser) {
      const uid = window.fb.auth.currentUser.uid;
      const { db, doc, deleteDoc } = window.fb;
      try {
        const songRef = this.currentBandId
          ? doc(db, "bands", this.currentBandId, "songs", nameToDelete)
          : doc(db, "users", uid, "songs", nameToDelete);

        await deleteDoc(songRef); // Nu dör låten i molnet också!
      } catch (e) {
        console.error("Could not delete from cloud:", e);
      }
    }

    // 3. Uppdatera skärmen
    this.updateProjectList();

    // Navigera alltid till närmaste låt efter radering — oavsett vilken låt var aktiv
    if (order.length > 0) {
      const nextIndex = Math.min(deletedIndex, order.length - 1);
      this.loadProject(order[nextIndex]);
    } else {
      this.createNewProject();
    }

    // Stäng alltid edit-läget efter radering (oavsett om det var på eller inte)
    if (this.isEditMode) this.toggleEditMode();
  }

  async deleteAllProjects() {
    if (
      await this.showCustomConfirm(
        "Are you sure? This will permanently delete ALL songs."
      )
    ) {
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECTS);
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT);
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER);
      this.updateProjectList();
      this.createNewProject();
      this.showCustomAlert("All songs have been deleted.");
    }
  }

  generatePdfForProject(projectData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 15;
    const sectionMargin = 15;
    const lyricMargin = 35;
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
    const CHORD_OFFSET = baseFontSizePt * 0.35;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(projectData.title || "Song Title", sectionMargin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(projectData.author || "Artist", pageWidth - sectionMargin, y, {
      align: "right",
    });
    y += 12;

    const lines = (projectData.content || "").split("\n");

    lines.forEach((lineText) => {
      let sectionType = null;
      let remainingText = lineText.replace(/^::(.*?)::/, (match, type) => {
        sectionType = type;
        return "";
      });

      const lineHasContent = remainingText.trim().length > 0;
      const pageBreakThreshold = 280;

      let estimatedLineHeight = LYRIC_LINE_HEIGHT;
      if (sectionType && !lineHasContent) {
        estimatedLineHeight = SECTION_HEADER_LINE_HEIGHT;
      }
      if (y + estimatedLineHeight > pageBreakThreshold) {
        doc.addPage();
        y = 20;
      }

      if (sectionType) {
        if (y > 25) y += LYRIC_LINE_HEIGHT * 0.5;
        const cleanedSectionType = sectionType.replace(/\u200B/g, "");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(baseFontSizePt);
        doc.setTextColor(TEXT_COLOR);
        doc.text(cleanedSectionType, sectionMargin, y);
      }

      if (lineHasContent) {
        const parts = remainingText.split(/(\[[^\]]+\])/g).filter((p) => p);
        let currentX = lyricMargin;

        parts.forEach((part) => {
          if (part.startsWith("[") && part.endsWith("]")) {
            const chord = part.substring(1, part.length - 1);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(baseFontSizePt * 0.85);
            doc.setTextColor(CHORD_COLOR);
            doc.text(chord, currentX, y - CHORD_OFFSET);
          } else {
            const cleanedPart = part.replace(/\u200B/g, "");
            doc.setFont("helvetica", "normal");
            doc.setFontSize(baseFontSizePt);
            doc.setTextColor(TEXT_COLOR);
            doc.text(cleanedPart, currentX, y);
            currentX += doc.getTextWidth(cleanedPart);
          }
        });

        y += LYRIC_LINE_HEIGHT;
      } else if (sectionType) {
        y += LYRIC_LINE_HEIGHT;
      } else {
        y += LYRIC_LINE_HEIGHT * 0.7;
      }
    });
    return doc.output("blob");
  }

  exportPdf() {
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
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
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
    this.syncChordData();
    const title = this.titleInput.value;
    const author = this.authorInput.value;
    const content = this.getContentAsText();
    const fullText = `${title}\n${author}\n\n${content}`;
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${this.sanitizeFilename(title)}.txt`);
  }

  async exportAllAsZip() {
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
    try {
      const projects =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
        ) || {};
      if (Object.keys(projects).length === 0)
        return this.showCustomAlert("No songs to export.");

      // Låter användaren veta att appen jobbar i bakgrunden
      this.showCustomAlert("Generating ZIP file. Please wait...");

      const zip = new JSZip();
      for (const key in projects) {
        const project = projects[key];
        const pdfBlob = this.generatePdfForProject(project);
        zip.file(`${this.sanitizeFilename(project.title)}.pdf`, pdfBlob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "all_songs.zip");
    } catch (e) {
      this.showCustomAlert("Error during ZIP-export.");
    }
  }

  exportJson() {
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
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
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    const order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];

    const projectsArray = [];

    order.forEach((title) => {
      if (projects[title]) {
        projectsArray.push(projects[title]);
      }
    });

    Object.keys(projects).forEach((title) => {
      if (!order.includes(title)) {
        projectsArray.push(projects[title]);
      }
    });

    const blob = new Blob([JSON.stringify(projectsArray, null, 2)], {
      type: "application/json",
    });
    saveAs(blob, `songs_backup.json`);
  }

  async exportAllAsZip() {
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
    try {
      const projects =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
        ) || {};
      if (Object.keys(projects).length === 0)
        return this.showCustomAlert("No songs to export.");

      // Låter användaren veta att appen jobbar i bakgrunden
      this.showCustomAlert("Generating ZIP file. Please wait...");

      const zip = new JSZip();
      for (const key in projects) {
        const project = projects[key];
        const pdfBlob = this.generatePdfForProject(project);
        zip.file(`${this.sanitizeFilename(project.title)}.pdf`, pdfBlob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "all_songs.zip");
    } catch (e) {
      this.showCustomAlert("Error during ZIP-export.");
    }
  }

  exportJson() {
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
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

  // --- UPPDATERAD EXPORT: Använd sorteringen ---
  exportAllJson() {
    this.backupModal.classList.remove("visible"); // Stänger menyn direkt
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    const order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];

    const projectsArray = [];

    order.forEach((title) => {
      if (projects[title]) {
        projectsArray.push(projects[title]);
      }
    });

    Object.keys(projects).forEach((title) => {
      if (!order.includes(title)) {
        projectsArray.push(projects[title]);
      }
    });

    const blob = new Blob([JSON.stringify(projectsArray, null, 2)], {
      type: "application/json",
    });
    saveAs(blob, `songs_backup.json`);
  }
  // --- SETLIST LOGIK: DELA ---

  // Bygger listan med drag-and-drop-rader
  // Bygger två kolumner (Alla låtar vs Setlist)
  // Bygger listan med drag-and-drop-rader
  populateSetlistOptions() {
    this.setlistSelectedList.innerHTML = "";
    this.setlistAvailableList.innerHTML = "";
    this.setlistCodeDisplay.classList.add("hidden");
    this.setlistCodeDisplay.textContent = "";

    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    const order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];

    if (order.length === 0) {
      this.setlistAvailableList.innerHTML =
        "<p style='padding:10px; opacity:0.7;'>No saved songs.</p>";
      if (this.selectedCount) this.selectedCount.textContent = "0";
      return;
    }

    let draggedItem = null;

    const updateCount = () => {
      if (this.selectedCount)
        this.selectedCount.textContent =
          this.setlistSelectedList.children.length;
    };

    // Ladda in Gig-läget eller det senaste utkastet man pillade med!
    const preSelectedTitles = this.activeSetlist || this.draftSetlist || [];

    order.forEach((title) => {
      if (projects[title]) {
        const row = document.createElement("div");
        row.className = "song-transfer-item";
        //row.draggable = true;
        row.dataset.title = title;

        const leftContent = document.createElement("div");
        leftContent.style.display = "flex";
        leftContent.style.alignItems = "center";

        const handle = document.createElement("span");
        handle.innerHTML = "&#9776;";
        handle.className = "drag-handle";
        handle.addEventListener("mousedown", () => (row.draggable = true));
        handle.addEventListener("touchstart", () => (row.draggable = true), {
          passive: true,
        });

        const labelSpan = document.createElement("span");
        labelSpan.textContent = title;

        leftContent.appendChild(handle);
        leftContent.appendChild(labelSpan);

        // Kolla om låten ska ligga i setlistan från början
        const isSelected = preSelectedTitles.includes(title);

        const actionIcon = document.createElement("span");
        actionIcon.innerHTML = isSelected ? "&times;" : "+";
        actionIcon.className = isSelected
          ? "action-icon remove-icon"
          : "action-icon add-icon";

        row.appendChild(leftContent);
        row.appendChild(actionIcon);

        row.addEventListener("click", (e) => {
          if (e.target === handle) return;
          if (row.parentNode === this.setlistAvailableList) {
            this.setlistSelectedList.appendChild(row);
            actionIcon.innerHTML = "&times;";
            actionIcon.className = "action-icon remove-icon";
          } else {
            this.setlistAvailableList.appendChild(row);
            actionIcon.innerHTML = "+";
            actionIcon.className = "action-icon add-icon";
          }
          updateCount();
        });

        row.addEventListener("dragstart", function (e) {
          draggedItem = this;
          setTimeout(() => (this.style.opacity = "0.4"), 0);
        });

        row.addEventListener("dragend", function () {
          setTimeout(() => (this.style.opacity = "1"), 0);
          draggedItem = null;
          this.draggable = false; // <--- NYTT: Stäng av dragläget igen
        });

        row.addEventListener("dragover", function (e) {
          e.preventDefault();
        });
        row.addEventListener("dragenter", function (e) {
          e.preventDefault();
          this.classList.add("drag-over");
        });
        row.addEventListener("dragleave", function () {
          this.classList.remove("drag-over");
        });

        row.addEventListener("drop", function () {
          this.classList.remove("drag-over");
          if (
            this !== draggedItem &&
            this.parentNode === draggedItem.parentNode
          ) {
            const allItems = Array.from(this.parentNode.children);
            const draggedIndex = allItems.indexOf(draggedItem);
            const targetIndex = allItems.indexOf(this);
            if (draggedIndex < targetIndex) {
              this.parentNode.insertBefore(draggedItem, this.nextSibling);
            } else {
              this.parentNode.insertBefore(draggedItem, this);
            }
          }
        });

        // Placera raden i rätt kolumn från start!
        if (isSelected) {
          this.setlistSelectedList.appendChild(row);
        } else {
          this.setlistAvailableList.appendChild(row);
        }
      }
    });

    // Sortera Setlistan så att den matchar den exakta ordningen man hade
    if (preSelectedTitles.length > 0) {
      const selectedRows = Array.from(this.setlistSelectedList.children);
      selectedRows.sort((a, b) => {
        return (
          preSelectedTitles.indexOf(a.dataset.title) -
          preSelectedTitles.indexOf(b.dataset.title)
        );
      });
      selectedRows.forEach((row) => this.setlistSelectedList.appendChild(row));
    }

    updateCount();
  }

  // Genererar en slumpmässig 6-teckens kod (tex. ROCK99)
  generateRandomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async generateSetlist() {
    if (!window.fb) {
      this.showCustomAlert("Server not connected.");
      return;
    }

    const rows = this.setlistSelectedList.querySelectorAll(
      ".song-transfer-item"
    );
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    const sharedSongs = [];

    rows.forEach((row) => {
      const title = row.dataset.title;
      if (projects[title]) {
        sharedSongs.push(projects[title]);
      }
    });

    if (sharedSongs.length === 0) {
      this.showCustomAlert("Select at least one song to share.");
      return;
    }

    // NYTT: Spara listan som "utkast" så rutan minns detta nästa gång du öppnar den!
    this.draftSetlist = sharedSongs.map((s) => s.title);

    // --- NY LOGIK FÖR EGEN KOD ---
    const codeInput = document.getElementById("custom-setlist-code-input");
    let shareCode = codeInput ? codeInput.value.trim().toUpperCase() : "";

    // Om användaren lämnar tomt, slumpa en kod som tidigare
    if (!shareCode) {
      shareCode = this.generateRandomCode();
    } else {
      // Formatera koden: byt ut mellanslag mot understreck och ta bort konstiga tecken
      shareCode = shareCode.replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    }

    if (shareCode.length < 3) {
      this.showCustomAlert("The code must be at least 3 characters long.");
      return;
    }
    // -------------------------------

    this.btnGenerateSetlist.textContent = "Creating...";
    this.btnGenerateSetlist.disabled = true;

    try {
      const { db, doc, setDoc } = window.fb;
      const setlistRef = doc(db, "shared_setlists", shareCode);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), 8000)
      );
      const uploadPromise = setDoc(setlistRef, {
        createdAt: new Date().toISOString(),
        songs: sharedSongs,
        createdBy: window.fb.auth.currentUser
          ? window.fb.auth.currentUser.displayName || "An artist"
          : "Anonymous",
      });

      await Promise.race([uploadPromise, timeoutPromise]);

      // --- NYTT: Stäng Setlist-rutan ---
      if (this.createSetlistModal) {
        this.createSetlistModal.classList.remove("visible");
      }

      // Visa bekräftelsen i en Alert
      this.showCustomAlert(`Setlist shared! Your code is: ${shareCode}`);

      // Töm inmatningsfältet för nästa gång
      if (codeInput) codeInput.value = "";
    } catch (error) {
      console.error("Error while sharing:", error);
      if (error.message === "TIMEOUT") {
        this.showCustomAlert("Server is not responding (Timeout).");
      } else {
        this.showCustomAlert("Error when sharing setlist.");
      }
    } finally {
      this.btnGenerateSetlist.textContent = "Share";
      this.btnGenerateSetlist.disabled = false;
    }
  }

  // --- SETLIST LOGIK: HÄMTA ---

  async fetchSharedSetlist() {
    if (!window.fb) {
      this.showCustomAlert("Firebase is not connected.");
      return;
    }

    // Hämta koden och gör den till stora bokstäver
    // Hämta koden och gör den till stora bokstäver
    const shareCode = this.setlistCodeInput.value.trim().toUpperCase();

    // Tillåt alla koder som är 3 tecken eller längre
    if (!shareCode || shareCode.length < 3) {
      this.showCustomAlert(
        "Please enter a valid code (at least 3 characters)."
      );
      return;
    }

    this.btnDownloadSetlist.textContent = "Fetching...";
    this.btnDownloadSetlist.disabled = true;

    try {
      const { db, doc, getDoc } = window.fb; // Vi behöver getDoc för att hämta ETT specifikt dokument
      const setlistRef = doc(db, "shared_setlists", shareCode);
      const docSnap = await getDoc(setlistRef);

      if (!docSnap.exists()) {
        this.showCustomAlert("Invalid code. Could not find setlist.");
        return;
      }

      const setlistData = docSnap.data();
      const songsArray = setlistData.songs || [];

      if (songsArray.length === 0) {
        this.showCustomAlert("This setlist appears to be empty");
        return;
      }

      // Nu gör vi exakt samma sak som när vi importerar JSON!
      const projects =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
        ) || {};
      let order =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
        ) || [];

      let newCount = 0;
      let updateCount = 0;

      // Lista ut namnen på låtarna som kommer in
      const newTitles = songsArray.map((p) => p.title).filter((t) => t);

      // Ta bort de nya namnen från den gamla ordningen så vi kan flytta dem till botten
      order = order.filter((title) => !newTitles.includes(title));

      // Spara låtarna!
      for (const song of songsArray) {
        if (song && song.title) {
          if (projects[song.title]) {
            updateCount++;
          } else {
            newCount++;
          }
          projects[song.title] = song;
        }
      }

      // Lägg in de nya låtarna längst ner i listan
      order.push(...newTitles);

      // Uppdatera LocalStorage
      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECTS,
        JSON.stringify(projects)
      );
      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
        JSON.stringify(order)
      );

      // Uppdatera listan i menyn
      this.updateProjectList();

      // Om bandmedlemmen är inloggad, skickar vi upp låtarna till deras egen Firebase!
      //if (window.fb.auth.currentUser) {
      //  this.syncAllLocalToCloud(); // Använder funktionen vi byggde tidigare!
      //}

      this.showCustomAlert(
        `Downloaded ${newCount} new songs and updated ${updateCount} existing ones from the setlist created by ${
          setlistData.createdBy || "unknown"
        }.`
      );

      // Stäng rutan och töm fältet
      this.setlistCodeInput.value = "";
      document
        .getElementById("fetch-setlist-modal")
        .classList.remove("visible");

      // --- NYTT: GÅ IN I GIG LÄGE! ---
      this.activeSetlist = newTitles; // Sätt appen i Gig-läge med de nya låtarna
      if (this.btnExitSetlist) this.btnExitSetlist.classList.remove("hidden"); // Visa Avsluta-knappen
      this.hamburgerBtn.classList.add("hidden");

      this.updateProjectList(); // Ladda om menyn (som nu bara kommer visa setlisten)

      this.showCustomAlert(
        `GIG-MODE ACTIVATED!\nDownloaded ${newCount} new songs and updated ${updateCount} current ones.\nYou now only see the setlist songs in the menu.`
      );

      // Ladda den första låten i setlisten direkt på skärmen
      if (songsArray.length > 0) {
        this.loadProject(songsArray[0].title);
      }
    } catch (error) {
      console.error("Error fetching:", error);
      this.showCustomAlert("An error occurred while downloading the setlist.");
    } finally {
      this.btnDownloadSetlist.textContent = "Download";
      this.btnDownloadSetlist.disabled = false;
    }
  }

  importJsonFromFile(file) {
    if (!file) return;

    // --- NYTT: Stäng Backup-menyn direkt när en fil har valts! ---
    this.backupModal.classList.remove("visible");

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          if (
            await this.showCustomConfirm(
              `${data.length} songs found. Import? Existing songs with the same name will be overwritten.`
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

  importSingleProject(data) {
    this.titleInput.value = data.title || "";
    this.authorInput.value = data.author || "";
    this.editor.style.fontSize = data.fontSize || "16px";
    this.loadContent(data.content || "", true);
    if (data.scrollSpeed) this.scrollSpeed = data.scrollSpeed;
    if (data.duration) this.updateDurationInputs(data.duration);
    this.saveProject(data.title);
  }

  // --- UPPDATERAD IMPORT: Tvinga filens ordning ---
  async importMultipleProjects(projectsArray) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    let order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];
    let importedCount = 0,
      overwrittenCount = 0;

    const newTitles = projectsArray.map((p) => p.title).filter((t) => t);
    order = order.filter((title) => !newTitles.includes(title));

    // Förbered moln-variabler
    const isCloudConnected = window.fb && window.fb.auth.currentUser;
    let uid, db, doc, setDoc;
    if (isCloudConnected) {
      uid = window.fb.auth.currentUser.uid;
      db = window.fb.db;
      doc = window.fb.doc;
      setDoc = window.fb.setDoc;
    }

    for (const project of projectsArray) {
      if (project && project.title) {
        if (projects[project.title]) overwrittenCount++;
        else importedCount++;

        projects[project.title] = project;

        // SPARA TILL MOLNET DIREKT VID IMPORT
        // SPARA TILL MOLNET DIREKT VID IMPORT
        if (isCloudConnected) {
          try {
            // NYTT: Nu kollar appen om du är i ett band innan den laddar upp!
            const songRef = this.currentBandId
              ? doc(db, "bands", this.currentBandId, "songs", project.title)
              : doc(db, "users", uid, "songs", project.title);

            await setDoc(songRef, {
              ...project,
              updatedAt: new Date().toISOString(),
            });
          } catch (e) {
            console.error(`Error loading ${project.title} to the cloud:`, e);
          }
        }
      }
    }

    order.push(...newTitles);

    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
      JSON.stringify(order)
    );

    this.updateProjectList();
    this.showCustomAlert(
      `${importedCount} New songs imported. ${overwrittenCount} songs updated. ${
        isCloudConnected ? "All synced to the cloud!" : ""
      }`
    );

    if (projectsArray.length > 0) this.loadProject(projectsArray[0].title);
  }

  sanitizeFilename(name) {
    return name.replace(/[\/\\?%*:|"<>]/g, "-") || "song";
  }

  // --- SCROLL FUNKTIONALITET ---
  toggleScrolling() {
    if (this.scrollInterval) this.stopScrolling();
    else this.startScrolling();
  }

  startScrolling() {
    if (this.scrollInterval) return;
    if (this.scrollSpeed <= 0) {
      this.calculateAndSetScrollSpeed();
    }
    if (this.scrollSpeed <= 0) return;

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
    let minutes, seconds;
    if (totalSeconds > 0) {
      minutes = Math.floor(totalSeconds / 60);
      seconds = totalSeconds % 60;
      this.scrollDurationMinutesInput.value = minutes;
      this.scrollDurationSecondsInput.value = seconds;
    } else {
      minutes = 4;
      seconds = 0;
      this.scrollDurationMinutesInput.value = 4;
      this.scrollDurationSecondsInput.value = 0;
    }

    if (this.scrollDurationText) {
      const formattedSeconds = String(seconds).padStart(2, "0");
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

  processSmartPaste(text) {
    const lines = text.split("\n");
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trimEnd();
      const nextLine = i + 1 < lines.length ? lines[i + 1].trimEnd() : "";

      if (this.isChordLine(currentLine)) {
        if (nextLine && !this.isChordLine(nextLine)) {
          const merged = this.mergeChordAndLyricLines(lines[i], lines[i + 1]);
          result.push(merged);
          i++;
        } else {
          result.push(
            currentLine.replace(/([A-G][#b]?[a-zA-Z0-9\/]*)/g, "[$1]")
          );
        }
      } else {
        result.push(currentLine);
      }
    }
    return result.join("\n");
  }

  isChordLine(line) {
    if (!line.trim()) return false;

    const tokens = line.trim().split(/\s+/);
    let chordCount = 0;

    const chordRegex =
      /^[A-G][#b]?(m|min|maj|dim|aug|sus|add|[0-9])*(\/[A-G][#b]?)?$/;

    tokens.forEach((token) => {
      const cleanToken = token.replace(/[()]/g, "");
      if (chordRegex.test(cleanToken)) chordCount++;
    });

    return chordCount / tokens.length > 0.8;
  }

  mergeChordAndLyricLines(chordLine, lyricLine) {
    let result = "";
    let lyricIndex = 0;

    const regex = /([A-G][#b]?[^\s]*)/g;
    let match;
    const chords = [];

    while ((match = regex.exec(chordLine)) !== null) {
      chords.push({
        text: match[1],
        index: match.index,
      });
    }

    if (chords.length === 0) return lyricLine;

    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];

      if (chord.index > lyricIndex) {
        if (chord.index > lyricLine.length) {
          result += lyricLine.substring(lyricIndex);
          result += " ".repeat(chord.index - lyricLine.length);
          lyricIndex = lyricLine.length + (chord.index - lyricLine.length);
        } else {
          result += lyricLine.substring(lyricIndex, chord.index);
          lyricIndex = chord.index;
        }
      }

      result += `[${chord.text}]`;
    }

    if (lyricIndex < lyricLine.length) {
      result += lyricLine.substring(lyricIndex);
    }

    return result;
  }
  // ==========================================
  // --- BAND & GRUPP LOGIK ---
  // ==========================================

  async checkUserBand(uid) {
    try {
      const { db, doc, getDoc } = window.fb;
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists() && userSnap.data().currentBandId) {
        this.currentBandId = userSnap.data().currentBandId;
        this.currentBandName = userSnap.data().bandName || "My Band";
      } else {
        this.currentBandId = null;
        this.currentBandName = null;
      }
    } catch (e) {
      console.error("Error loading band status:", e);
      this.currentBandId = null;
      this.currentBandName = null;
    } finally {
      // NYTT: Se till att UI alltid uppdateras, oavsett om databasen bråkar
      this.updateBandUI();
    }
  }

  async createBand() {
    if (!window.fb || !window.fb.auth.currentUser) {
      this.bandModal.classList.remove("visible");
      return this.showCustomAlert(
        "You must log in (via the side menu) before you can create a band!"
      );
    }

    // --- NYTT: Stäng modalen omedelbart så den inte ligger i bakgrunden! ---
    this.bandModal.classList.remove("visible");

    const bandName = prompt("What should the band be called?");
    if (!bandName) return;

    const bandCode = this.generateRandomCode();
    const uid = window.fb.auth.currentUser.uid;
    const { db, doc, setDoc } = window.fb;

    try {
      await setDoc(doc(db, "bands", bandCode), {
        name: bandName,
        members: [uid],
        createdAt: new Date().toISOString(),
      });

      await setDoc(
        doc(db, "users", uid),
        {
          currentBandId: bandCode,
          bandName: bandName,
        },
        { merge: true }
      );

      this.currentBandId = bandCode;
      this.currentBandName = bandName;
      this.updateBandUI();

      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECTS);
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER);
      this.fetchSongsFromCloud();
      this.createNewProject();

      this.showCustomAlert(`Band created!\nYour invite code is: ${bandCode}`);
    } catch (e) {
      console.error(e);
      this.showCustomAlert(
        "Could not create the band. Check your Firebase rules!"
      );
    }
  }

  async joinBand() {
    if (!window.fb || !window.fb.auth.currentUser) {
      this.bandModal.classList.remove("visible");
      return this.showCustomAlert(
        "You must log in (via the side menu) before you can join a band!"
      );
    }

    // --- NYTT: Stäng modalen omedelbart! ---
    this.bandModal.classList.remove("visible");

    const code = prompt("Enter the band's invite code:")?.toUpperCase();
    if (!code || code.length < 3) return;

    const uid = window.fb.auth.currentUser.uid;
    const { db, doc, getDoc, setDoc } = window.fb;

    try {
      const bandRef = doc(db, "bands", code);
      const bandSnap = await getDoc(bandRef);

      if (bandSnap.exists()) {
        const bandData = bandSnap.data();
        const members = bandData.members || [];

        if (!members.includes(uid)) {
          members.push(uid);
          await setDoc(bandRef, { members: members }, { merge: true });
        }

        await setDoc(
          doc(db, "users", uid),
          {
            currentBandId: code,
            bandName: bandData.name,
          },
          { merge: true }
        );

        this.currentBandId = code;
        this.currentBandName = bandData.name;
        this.updateBandUI();

        localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECTS);
        localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER);
        this.fetchSongsFromCloud();

        this.showCustomAlert(`You have joined: ${bandData.name}!`);
      } else {
        this.showCustomAlert("Could not find a band with that code.");
      }
    } catch (e) {
      console.error(e);
      this.showCustomAlert("An error occurred when trying to join.");
    }
  }

  async leaveBand() {
    // --- NYTT: Stäng modalen direkt så dialogrutorna inte krockar! ---
    this.bandModal.classList.remove("visible");

    const confirmed = await this.showCustomConfirm(
      "Are you sure you want to leave the band and return to your private songs?"
    );
    if (!confirmed) return;

    const uid = window.fb.auth.currentUser.uid;
    const { db, doc, setDoc } = window.fb;

    try {
      await setDoc(
        doc(db, "users", uid),
        {
          currentBandId: null,
          bandName: null,
        },
        { merge: true }
      );

      this.currentBandId = null;
      this.currentBandName = null;
      this.updateBandUI();

      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECTS);
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER);
      this.fetchSongsFromCloud();
      this.createNewProject();

      this.showCustomAlert("You are playing solo again!");
    } catch (e) {
      console.error(e);
    }
  }
updateBandUI() {
    const modalBox = this.bandModal.querySelector(".custom-dialog-box");
    
    // --- NYTT: Byt namn i toppmenyn (ProChorder <-> Bandnamn) ---
    const topBarName = document.getElementById("top-bar-band-name");
    if (topBarName) {
      topBarName.textContent = this.currentBandName ? this.currentBandName : "ProChorder";
    }
    if (this.currentBandId) {
      modalBox.innerHTML = `
        <h3 style="margin-top: 0">${this.currentBandName}</h3>
        <p style="font-size: 0.85em; opacity: 0.8;">Invite code (give to other members):</p>
        <p style="font-size: 1.8em; font-weight: bold; color: var(--primary); margin: 0.2em 0 1em 0; letter-spacing: 2px;">
          ${this.currentBandId}
        </p>
        <div class="sidebar-controls vertical" style="gap: 0.8em; min-width: 250px">
            <button id="btn-band-leave" class="btn-danger">Leave Band</button>
        </div>
        <div class="dialog-buttons">
          <button id="band-modal-close-new" class="btn-primary">Close</button>
        </div>
      `;
      // NYTT: Tvinga klick-funktionen med .onclick (mycket säkrare än addEventListener här!)
      document.getElementById("btn-band-leave").onclick = () =>
        this.leaveBand();
    } else {
      modalBox.innerHTML = `
        <h3 style="margin-top: 0">Band Mode</h3>
        <p style="font-size: 0.85em; opacity: 0.8; margin-bottom: 1.5em">
          Create a new band or join one to sync your songs in real-time.
        </p>
        <div class="sidebar-controls vertical" style="gap: 0.8em; min-width: 250px">
            <button id="btn-band-create" class="btn-primary">Create new band</button>
            <button id="btn-band-join" class="btn-secondary-style">Join band</button>
        </div>
        <div class="dialog-buttons">
          <button id="band-modal-close-new" class="btn-primary">Close</button>
        </div>
      `;
      // NYTT: Tvinga klick-funktionerna med .onclick!
      document.getElementById("btn-band-create").onclick = () =>
        this.createBand();
      document.getElementById("btn-band-join").onclick = () => this.joinBand();
    }

    document.getElementById("band-modal-close-new").onclick = () => {
      this.bandModal.classList.remove("visible");
    };
  }
}

window.addEventListener("load", () => {
  window.app = new StableChordEditor("editor");
});
