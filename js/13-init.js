/* App start */
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
applyDisplayMode();
applyAppConfig();
updateCheckoutUI();
applyStoreMode();
syncAdminBtn();
updateSectionNav();
updateMobileBar();
lucide.createIcons();
setupA11y();
