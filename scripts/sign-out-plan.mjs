export async function runPreSignInSignOut({ livePreview, requestSignOut, clearToken }) {
  try {
    if (livePreview) {
      clearToken?.();
      await Promise.race([
        Promise.resolve().then(() => requestSignOut?.()),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } else {
      await requestSignOut?.();
      clearToken?.();
    }
  } catch {
    clearToken?.();
  }
}

export async function runSignOut({ livePreview, requestSignOut, clearToken, redirect }) {
  try {
    await requestSignOut?.();
  } catch (err) {
    if (!livePreview) throw err;
  }
  clearToken?.();
  redirect?.();
}
