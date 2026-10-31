const bridge = window.SchwarzschildNative;
const nativeMessageHandler = window.webkit?.messageHandlers?.schwarzschild;
const nativeRuntime = Boolean(bridge?.isNative === true || nativeMessageHandler);
const localDevelopment = ['127.0.0.1', 'localhost', '::1'].includes(location.hostname);

let active = nativeRuntime ? Boolean(bridge?.vip) : true;
let ready = !nativeRuntime;
let pendingPurchase = null;

function post(type, payload = {}) {
  const message = { type, ...payload };
  if (bridge && typeof bridge[type] === 'function') {
    bridge[type](payload);
    return true;
  }
  if (nativeMessageHandler) {
    nativeMessageHandler.postMessage(message);
    return true;
  }
  return false;
}

export function isNativeRuntime() {
  return nativeRuntime;
}

export function isVipActive() {
  return active;
}

export function isVipReady() {
  return ready;
}

export function requestVipPurchase(source) {
  if (!nativeRuntime) return false;
  pendingPurchase = source;
  return post('requestPurchase', { source });
}

export function restoreVipPurchases() {
  return nativeRuntime && post('restorePurchases');
}

export function notifyNativeWebReady() {
  return nativeRuntime && post('webReady');
}

export function consumePendingVipSource() {
  const source = pendingPurchase;
  pendingPurchase = null;
  return source;
}

export function requestNativeFullscreen() {
  if (!nativeRuntime) return false;
  return post('openFullscreen');
}

export function openNativePrivacy() {
  return nativeRuntime && post('openPrivacy');
}

export function openNativeSupport() {
  return nativeRuntime && post('openSupport');
}

export function saveImageWithNative(dataURL) {
  if (!nativeRuntime) return false;
  return post('saveImage', { dataURL });
}

export function saveShareWithNative(dataURL) {
  if (!nativeRuntime) return false;
  return post('saveImage', { dataURL, share: true });
}

export function initialVipState() {
  return {
    active,
    ready,
    native: nativeRuntime,
    localDevelopment,
  };
}

function applyEntitlement(detail = {}) {
  active = Boolean(detail.vip ?? detail.active);
  ready = true;
  document.dispatchEvent(new CustomEvent('schwarzschild-entitlement', {
    detail: {vip: active, ready, native: nativeRuntime, source: detail.source},
  }));
  return active;
}

// Native code calls this helper after StoreKit has produced a verified result.
window.addEventListener('schwarzschild-entitlement', event => {
  if (!(event instanceof CustomEvent)) return;
  const detail = event.detail || {};
  if (typeof detail.vip === 'boolean') {
    active = nativeRuntime ? detail.vip : Boolean(detail.vip ?? true);
    ready = true;
  }
});

if (bridge && typeof bridge.setEntitlement === 'function') {
  const nativeSetter = bridge.setEntitlement.bind(bridge);
  bridge.setEntitlement = detail => {
    const result = nativeSetter(detail);
    applyEntitlement(detail);
    return result;
  };
}

// Keep an object available for native injection and integration tests.
window.SchwarzschildEntitlement = {
  applyEntitlement,
  isActive: isVipActive,
  isReady: isVipReady,
  requestPurchase: requestVipPurchase,
  restore: restoreVipPurchases,
};
