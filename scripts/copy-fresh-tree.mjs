import { constants } from "node:fs";
import { copyFile, chmod, lstat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

export async function copyFreshTree(source, destination, options = {}) {
  if (options.preserveTimestamps) throw new Error("Timestamp preservation is outside this build contract");
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink()) throw new Error("Source symlink is forbidden: " + source);
  if (sourceStat.isDirectory()) {
    if (!options.recursive) throw new Error("Directory copy requires recursive:true");
    // Parents already exist; fresh directories must reject existing destinations, including links.
    await mkdir(destination);
    for (const name of (await readdir(source)).sort()) {
      await copyFreshTree(path.join(source, name), path.join(destination, name), options);
    }
    await chmod(destination, sourceStat.mode & 0o777);
  } else if (sourceStat.isFile()) {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    await chmod(destination, sourceStat.mode & 0o777);
  } else {
    throw new Error("Unsupported source entry: " + source);
  }
}
