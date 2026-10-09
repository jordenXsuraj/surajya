import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * "Version 1.0.0 (build 3)": the installed app's own numbers. expo-application is a native module:
 * development clients built before 7 Oct 2026 don't have it and need the new build.
 */
export function appVersionLabel(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '?';
  const build = Application.nativeBuildVersion;
  return build ? `Version ${version} (build ${build})` : `Version ${version}`;
}
