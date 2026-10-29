/* Swipe + app start */
// Touch Swipe Listeners
let touchStartX = 0, touchEndX = 0;
const track = document.getElementById('carousel-track');
if (track) {
  track.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  track.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchEndX < touchStartX - 40) nextCarouselSlide();
    if (touchEndX > touchStartX + 40) prevCarouselSlide();
  }, { passive: true });
}

window.addEventListener('resize', () => {
  update3DCarousel();
});

// App Init
initPreloader();
applyDeadlineUI();
renderBoxBuilder();
updateCartUI();
updateLiveMetrics();
(async () => {
  if (SB() && adminToken) {
    try { const { data } = await sbClient.rpc('admin_check', { p_token: adminToken }); if (!data || !data.ok || data.must_change) adminSessionEnded(); } catch (e) {}
  }
  initSupabaseData();
  loadDisplayMode();
})();
applySiteUI();
applyDisplayMode();
applyAppConfig();
updateCheckoutUI();
applyStoreMode();
syncAdminBtn();
updateSectionNav();
updateMobileBar();
lucide.createIcons();
setupA11y();
