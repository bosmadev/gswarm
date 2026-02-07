// Preload patch: adds windowsHide: true to all child_process spawn/exec calls on Windows.
// Loaded via --require flag to fix @react-grab/claude-code grey window issue.
// See: https://nodejs.org/api/child_process.html#optionswindowshide
if (process.platform === "win32") {
  const cp = require("node:child_process");

  function injectWindowsHide(args) {
    const last = args[args.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last)) {
      last.windowsHide = true;
    }
  }

  function injectIntoOptions(rest) {
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] && typeof rest[i] === "object" && !Array.isArray(rest[i])) {
        rest[i].windowsHide = true;
        break;
      }
    }
  }

  const originalSpawn = cp.spawn;
  cp.spawn = function patchedSpawn(command, ...rest) {
    injectWindowsHide(rest);
    return originalSpawn.call(this, command, ...rest);
  };

  const originalExecFile = cp.execFile;
  cp.execFile = function patchedExecFile(file, ...rest) {
    injectIntoOptions(rest);
    return originalExecFile.call(this, file, ...rest);
  };

  const originalExec = cp.exec;
  cp.exec = function patchedExec(command, ...rest) {
    injectIntoOptions(rest);
    return originalExec.call(this, command, ...rest);
  };

  const originalFork = cp.fork;
  cp.fork = function patchedFork(modulePath, ...rest) {
    injectWindowsHide(rest);
    return originalFork.call(this, modulePath, ...rest);
  };
}
