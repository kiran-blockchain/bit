/** @flow */
import fs from 'fs-extra';
import R from 'ramda';
import parents from 'parents';
import path from 'path';
import { PACKAGE_JSON } from '../constants';

function composePath(componentRootFolder: string) {
  return path.join(componentRootFolder, PACKAGE_JSON);
}
function convertComponentsIdToValidPackageName(registryPrefix: string, id: string): string {
  return `${registryPrefix}/${id.replace(/\//g, '.')}`;
}

export default class PackageJson {
  static hasExisting(componentRootFolder: string): boolean {
    const packageJsonPath = composePath(componentRootFolder);
    return fs.pathExistsSync(packageJsonPath);
  }

  /**
   * Taken from this package (with some minor changes):
   * https://www.npmjs.com/package/find-package
   * https://github.com/jalba/find-package
   */
  static findPath(dir) {
    const parentsArr = parents(dir);
    let i;
    // eslint-disable-next-line
    for (i = 0; i < parentsArr.length; i++) {
      const config = `${parentsArr[i]}/package.json`;
      try {
        if (fs.lstatSync(config).isFile()) {
          return config;
        }
      } catch (e) {} // eslint-disable-line
    }
    return null;
  }

  /**
   * Taken from this package (with some minor changes):
   * https://www.npmjs.com/package/find-package
   * https://github.com/jalba/find-package
   *
   */
  static findPackage(dir, addPaths) {
    const pathToConfig = this.findPath(dir);
    let configJSON: any = null;
    // eslint-disable-next-line import/no-dynamic-require, global-require
    if (pathToConfig !== null) configJSON = require(path.resolve(pathToConfig));
    if (configJSON && addPaths) {
      configJSON.paths = {
        // @ts-ignore
        relative: path.relative(dir, pathToConfig),
        absolute: pathToConfig
      };
    } else if (configJSON !== null) {
      delete configJSON.paths;
    }

    return configJSON;
  }

  /*
   * load package.json from path
   */
  static async getPackageJson(pathStr: string) {
    const getRawObject = () => fs.readJson(composePath(pathStr));
    const exist = PackageJson.hasExisting(pathStr);
    if (exist) return getRawObject();
    return null;
  }

  /*
   * load package.json from path
   */
  static async getPackageJsonSync(pathStr: string) {
    const getRawObject = () => fs.readJsonSync(composePath(pathStr));
    const exist = PackageJson.hasExisting(pathStr);
    if (exist) return getRawObject();
    return null;
  }

  /*
   * save package.json in path
   */
  static saveRawObject(pathStr: string, obj: Record<string, any>) {
    return fs.outputJSON(composePath(pathStr), obj, { spaces: 2 });
  }

  /*
   * For an existing package.json file of the root project, we don't want to do any change, other than what needed.
   * That's why this method doesn't use the 'load' and 'write' methods of this class. Otherwise, it'd write only the
   * PackageJsonPropsNames attributes.
   * Also, in case there is no package.json file in this project, it generates a new one with only the 'dependencies'
   * adds workspaces with private flag if dosent exist.
   */
  static async addWorkspacesToPackageJson(
    rootDir: string,
    componentsDefaultDirectory: string,
    dependenciesDirectory: string,
    customImportPath: string | null | undefined
  ) {
    const pkg = (await PackageJson.getPackageJson(rootDir)) || {};
    const workSpaces = PackageJson.extractWorkspacesPackages(pkg) || [];
    workSpaces.push(dependenciesDirectory);
    workSpaces.push(componentsDefaultDirectory);
    if (customImportPath) workSpaces.push(customImportPath);
    if (!pkg.workspaces) pkg.workspaces = [];
    this.updateWorkspacesPackages(pkg, R.uniq(workSpaces));
    pkg.private = !!pkg.workspaces;
    await PackageJson.saveRawObject(rootDir, pkg);
  }

  /*
   * remove workspaces dir from workspace in package.json with changing other fields in package.json
   */
  static async removeComponentsFromWorkspaces(rootDir: string, pathsTOoRemove: string[]) {
    const pkg = (await PackageJson.getPackageJson(rootDir)) || {};
    const workspaces = this.extractWorkspacesPackages(pkg);
    if (!workspaces) return;
    const updatedWorkspaces = workspaces.filter(folder => !pathsTOoRemove.includes(folder));
    this.updateWorkspacesPackages(pkg, updatedWorkspaces);
    await PackageJson.saveRawObject(rootDir, pkg);
  }

  /*
   * remove components from package.json dependencies
   */
  static async removeComponentsFromDependencies(rootDir: string, registryPrefix, componentIds: string[]) {
    const pkg = await PackageJson.getPackageJson(rootDir);
    if (pkg && pkg.dependencies) {
      componentIds.forEach(id => {
        delete pkg.dependencies[convertComponentsIdToValidPackageName(registryPrefix, id)];
      });
      await PackageJson.saveRawObject(rootDir, pkg);
    }
  }

  static extractWorkspacesPackages(packageJson: { [k: string]: any }): string[] | null {
    if (!packageJson.workspaces) return null;
    this.throwForInvalidWorkspacesConfig(packageJson);
    if (Array.isArray(packageJson.workspaces)) {
      return packageJson.workspaces;
    }
    if (Array.isArray(packageJson.workspaces.packages)) {
      return packageJson.workspaces.packages;
    }
    return null;
  }

  static updateWorkspacesPackages(packageJson, workspacesPackages): void {
    if (!packageJson.workspaces) return;
    this.throwForInvalidWorkspacesConfig(packageJson);
    if (Array.isArray(packageJson.workspaces)) {
      packageJson.workspaces = workspacesPackages;
    }
    if (Array.isArray(packageJson.workspaces.packages)) {
      packageJson.workspaces.packages = workspacesPackages;
    }
  }

  /**
   * according to Yarn Git repo, the workspaces type configured as the following
   * `workspaces?: Array<string> | WorkspacesConfig`
   * and `WorkspacesConfig` is:
   * `export type WorkspacesConfig = { packages?: Array<string>, nohoist?: Array<string> };`
   * see https://github.com/yarnpkg/yarn/blob/master/src/types.js
   */
  static throwForInvalidWorkspacesConfig(packageJson) {
    if (!packageJson.workspaces) return;
    if (
      typeof packageJson.workspaces !== 'object' ||
      (!Array.isArray(packageJson.workspaces) && !Array.isArray(packageJson.workspaces.packages))
    ) {
      throw new Error('workspaces property does not have the correct format, please refer to Yarn documentation');
    }
  }
}
