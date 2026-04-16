/**
 * Strip inline event handlers from diary.html for stricter CSP (no script unsafe-inline).
 * Run: node scripts/patch-diary-html-launch.cjs
 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'diary.html');
let s = fs.readFileSync(file, 'utf8');

function rep(from, to) {
  if (!s.includes(from)) {
    console.warn('MISSING pattern (already patched or typo):', from.slice(0, 80));
    return;
  }
  s = s.split(from).join(to);
}

// tstep buttons (all species)
s = s.replace(/onclick="tstep\('([^']+)',(-?\d+)\)"/g, 'type="button" data-fl-action="tstep" data-step-id="$1" data-step-delta="$2"');

rep(' onclick="authTab(\'signin\')"', ' type="button" data-fl-action="auth-tab" data-tab="signin"');
rep(' onclick="authTab(\'signup\')"', ' type="button" data-fl-action="auth-tab" data-tab="signup"');
rep(' onclick="handleAuth()"', ' type="button" data-fl-action="handle-auth"');
rep(' onchange="changeSeason()"', '');
rep(' onclick="go(\'v-stats\')"', ' type="button" data-fl-action="go" data-view="v-stats"');
rep(' onclick="filterEntries(\'all\',this)"', ' type="button" data-fl-action="filter-entries" data-species="all"');
rep(' onclick="filterEntries(\'Red Deer\',this)"', ' type="button" data-fl-action="filter-entries" data-species="Red Deer"');
rep(' onclick="filterEntries(\'Roe Deer\',this)"', ' type="button" data-fl-action="filter-entries" data-species="Roe Deer"');
rep(' onclick="filterEntries(\'Fallow\',this)"', ' type="button" data-fl-action="filter-entries" data-species="Fallow"');
rep(' onclick="filterEntries(\'Sika\',this)"', ' type="button" data-fl-action="filter-entries" data-species="Sika"');
rep(' onclick="filterEntries(\'Muntjac\',this)"', ' type="button" data-fl-action="filter-entries" data-species="Muntjac"');
rep(' onclick="filterEntries(\'CWD\',this)"', ' type="button" data-fl-action="filter-entries" data-species="CWD"');
rep(' onclick="syncOfflineQueue()"', ' type="button" data-fl-action="sync-offline"');
rep(' onclick="openQuickEntry()"', ' type="button" data-fl-action="open-quick"');
rep(' onclick="openNewEntry()"', ' type="button" data-fl-action="open-new"');
rep('<div class="qsheet-overlay" id="qs-overlay" onclick="closeQuickEntry()"></div>', '<div class="qsheet-overlay" id="qs-overlay" data-fl-overlay="close-quick"></div>');
rep(' onclick="closeQuickEntry()"', ' type="button" data-fl-action="close-quick"');
rep('<div class="qs-more" onclick="closeQuickEntry(); openNewEntry();">', '<div class="qs-more" role="button" tabindex="0" data-fl-action="close-quick-then-new">');
rep('<div class="qs-pill" onclick="qsPick(this,\'Red Deer\')">', '<div class="qs-pill" role="button" tabindex="0" data-fl-action="qs-pick" data-species="Red Deer">');
rep('<div class="qs-pill" onclick="qsPick(this,\'Roe Deer\')">', '<div class="qs-pill" role="button" tabindex="0" data-fl-action="qs-pick" data-species="Roe Deer">');
rep('<div class="qs-pill" onclick="qsPick(this,\'Fallow\')">', '<div class="qs-pill" role="button" tabindex="0" data-fl-action="qs-pick" data-species="Fallow">');
rep('<div class="qs-pill" onclick="qsPick(this,\'Sika\')">', '<div class="qs-pill" role="button" tabindex="0" data-fl-action="qs-pick" data-species="Sika">');
rep('<div class="qs-pill" onclick="qsPick(this,\'Muntjac\')">', '<div class="qs-pill" role="button" tabindex="0" data-fl-action="qs-pick" data-species="Muntjac">');
rep('<div class="qs-pill" onclick="qsPick(this,\'CWD\')">', '<div class="qs-pill" role="button" tabindex="0" data-fl-action="qs-pick" data-species="CWD">');
rep(' onclick="qsSex(\'m\')"', ' type="button" data-fl-action="qs-sex" data-sex="m"');
rep(' onclick="qsSex(\'f\')"', ' type="button" data-fl-action="qs-sex" data-sex="f"');
rep(' onclick="saveQuickEntry()"', ' type="button" data-fl-action="save-quick"');
rep(' onclick="formBack()"', ' type="button" data-fl-action="form-back"');
rep(' onclick="offlinePhotoWarn(function(){ document.getElementById(\'photo-input-camera\').click(); })"', ' type="button" data-fl-action="photo-camera"');
rep(' onclick="offlinePhotoWarn(function(){ document.getElementById(\'photo-input-gallery\').click(); })"', ' type="button" data-fl-action="photo-gallery"');
rep(' onclick="removePhoto()"', ' type="button" data-fl-action="remove-photo"');
rep(' onchange="handlePhoto(this)"', '');
rep(' onclick="pickSpecies(this,\'Red Deer\')"', ' type="button" data-fl-action="pick-species" data-species="Red Deer"');
rep(' onclick="pickSpecies(this,\'Roe Deer\')"', ' type="button" data-fl-action="pick-species" data-species="Roe Deer"');
rep(' onclick="pickSpecies(this,\'Fallow\')"', ' type="button" data-fl-action="pick-species" data-species="Fallow"');
rep(' onclick="pickSpecies(this,\'Sika\')"', ' type="button" data-fl-action="pick-species" data-species="Sika"');
rep(' onclick="pickSpecies(this,\'Muntjac\')"', ' type="button" data-fl-action="pick-species" data-species="Muntjac"');
rep(' onclick="pickSpecies(this,\'CWD\')"', ' type="button" data-fl-action="pick-species" data-species="CWD"');
rep(' onclick="pickSex(\'m\')"', ' type="button" data-fl-action="pick-sex" data-sex="m"');
rep(' onclick="pickSex(\'f\')"', ' type="button" data-fl-action="pick-sex" data-sex="f"');
rep(' onclick="openPinDrop()"', ' type="button" data-fl-action="open-pin"');
rep(' onclick="getGPS()"', ' type="button" data-fl-action="get-gps"');
rep(' onclick="clearPinnedLocation()"', ' type="button" data-fl-action="clear-pinned"');
rep(' onchange="handleGroundSelect(this)"', '');
rep(' onchange="handleCalibreSelect(this)"', '');
rep(' onchange="handlePlacementSelect(this)"', '');
rep(' onclick="resetWeightField(\'c\')"', ' data-fl-action="reset-wt" data-wt-field="c"');
rep(' onclick="resetWeightField(\'l\')"', ' data-fl-action="reset-wt" data-wt-field="l"');
rep(' onclick="saveEntry()"', ' type="button" data-fl-action="save-entry"');
rep(' onchange="document.getElementById(\'season-select\').value=this.value;changeSeason();"', '');
rep(' onclick="setCullLayer(\'map\')"', ' type="button" data-fl-action="set-cull-layer" data-layer="map"');
rep(' onclick="setCullLayer(\'sat\')"', ' type="button" data-fl-action="set-cull-layer" data-layer="sat"');
rep(' onclick="filterCullMap(\'all\',this)"', ' data-fl-action="filter-cull-map" data-species="all"');
rep(' onclick="filterCullMap(\'Red Deer\',this)"', ' data-fl-action="filter-cull-map" data-species="Red Deer"');
rep(' onclick="filterCullMap(\'Roe Deer\',this)"', ' data-fl-action="filter-cull-map" data-species="Roe Deer"');
rep(' onclick="filterCullMap(\'Fallow\',this)"', ' data-fl-action="filter-cull-map" data-species="Fallow"');
rep(' onclick="filterCullMap(\'Muntjac\',this)"', ' data-fl-action="filter-cull-map" data-species="Muntjac"');
rep(' onclick="filterCullMap(\'Sika\',this)"', ' data-fl-action="filter-cull-map" data-species="Sika"');
rep(' onclick="filterCullMap(\'CWD\',this)"', ' data-fl-action="filter-cull-map" data-species="CWD"');
rep(' onclick="openTargetsSheet()"', ' type="button" data-fl-action="open-targets"');
rep(' onclick="openExportModal(\'csv\')"', ' type="button" data-fl-action="open-export" data-export-fmt="csv"');
rep(' onclick="openExportModal(\'pdf\')"', ' type="button" data-fl-action="open-export" data-export-fmt="pdf"');
rep(' onclick="openSummaryFilter()"', ' type="button" data-fl-action="open-summary-filter"');
rep(' onclick="signOut()"', ' type="button" data-fl-action="sign-out"');
rep(' onclick="confirmDeleteAccount()"', ' type="button" data-fl-action="confirm-delete-account"');
rep(' oninput="checkDeleteInput()"', '');
rep(' onclick="deleteAccount()"', ' type="button" data-fl-action="delete-account"');
rep(' onclick="closeDeleteModal()"', ' type="button" data-fl-action="close-delete-modal"');
rep(' onclick="doExport(\'season\')"', ' type="button" data-fl-action="do-export" data-export-scope="season"');
rep(' onclick="doExport(\'all\')"', ' type="button" data-fl-action="do-export" data-export-scope="all"');
rep(' onclick="closeExportModal()"', ' type="button" data-fl-action="close-export-modal"');
rep(' onclick="closePinDrop()"', ' type="button" data-fl-action="close-pin"');
rep(' oninput="pinmapSearchDebounce(this.value)"', '');
rep(' onkeydown="if(event.key===\'Enter\'){pinmapSearchNow(this.value);}"', '');
rep(' onclick="setPinLayer(\'map\')"', ' type="button" data-fl-action="set-pin-layer" data-layer="map"');
rep(' onclick="setPinLayer(\'sat\')"', ' type="button" data-fl-action="set-pin-layer" data-layer="sat"');
rep(' onclick="confirmPinDrop()"', ' type="button" data-fl-action="confirm-pin"');
rep('<div class="tsheet-ov" id="tsheet-ov" onclick="if(event.target===this)closeTargetsSheet()">', '<div class="tsheet-ov" id="tsheet-ov" data-fl-overlay="close-targets">');
rep(' onclick="closeTargetsSheet()"', ' type="button" data-fl-action="close-targets"');
rep(' onclick="copyTargetsFromPrev()"', ' type="button" data-fl-action="copy-targets-prev"');
rep(' onclick="setTargetMode(\'season\')"', ' type="button" data-fl-action="set-target-mode" data-mode="season"');
rep(' onclick="setTargetMode(\'ground\')"', ' type="button" data-fl-action="set-target-mode" data-mode="ground"');
rep(' onclick="showAddGroundInput()"', ' type="button" data-fl-action="show-add-ground"');
rep(' onkeydown="if(event.key===\'Enter\')confirmAddGround();if(event.key===\'Escape\')hideAddGroundInput();"', '');
rep(' onclick="hideAddGroundInput()"', ' type="button" data-fl-action="hide-add-ground"');
rep(' onclick="confirmAddGround()"', ' type="button" data-fl-action="confirm-add-ground"');
rep(' onclick="saveTargets()"', ' type="button" data-fl-action="save-targets"');
rep(' onclick="doExportSummaryFiltered()"', ' type="button" data-fl-action="do-export-summary"');
rep(' onclick="document.getElementById(\'summary-filter-modal\').style.display=\'none\'"', ' type="button" data-fl-action="close-summary-modal"');

// photo lightbox: outer div + close button (two closePhotoLightbox)
const lbOpen = '<div id="photo-lightbox" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.95);align-items:center;justify-content:center;flex-direction:column;" onclick="closePhotoLightbox()">';
const lbFixed = '<div id="photo-lightbox" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.95);align-items:center;justify-content:center;flex-direction:column;" data-fl-overlay="close-photo-lb">';
rep(lbOpen, lbFixed);
rep(' onclick="closePhotoLightbox()"', ' type="button" data-fl-action="close-photo-lb"');

// go v-list appears multiple times (stats back + nav) — remaining after others
while (s.includes(' onclick="go(\'v-list\')"')) {
  s = s.split(' onclick="go(\'v-list\')"').join(' type="button" data-fl-action="go" data-view="v-list"');
}

// CSP tighten scripts
s = s.replace(
  /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net https:\/\/cdnjs\.cloudflare\.com/,
  "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com"
);

fs.writeFileSync(file, s);
console.log('OK', file);
