/** Leaves the site for an outside page (Xendit's checkout). One place, so tests can stand in for it. */
export function goToExternal(url) {
  window.location.assign(url)
}
