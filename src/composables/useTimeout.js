export function useTimeout() {
  const timers = [];

  function setManagedTimeout(callback, delay) {
    const id = window.setTimeout(() => {
      removeTimer(id);
      callback();
    }, delay);

    timers.push(id);
    return id;
  }

  function removeTimer(id) {
    const index = timers.indexOf(id);
    if (index !== -1) {
      timers.splice(index, 1);
    }
  }

  function clearAllTimeouts() {
    timers.forEach(id => window.clearTimeout(id));
    timers.length = 0;
  }

  return {
    setManagedTimeout,
    clearAllTimeouts
  };
}