import * as path from "path";
import * as temp from "temp";

export class LiveSyncProvider implements ILiveSyncProvider {
	constructor(private $androidLiveSyncServiceLocator: {factory: Function},
		private $iosLiveSyncServiceLocator: {factory: Function},
		private $platformService: IPlatformService,
		private $platformsData: IPlatformsData,
		private $logger: ILogger,
		private $childProcess: IChildProcess) { }

	private static FAST_SYNC_FILE_EXTENSIONS = [".css", ".xml" ,".html"];

	private platformSpecificLiveSyncServicesCache: IDictionary<any> = {};
	public get platformSpecificLiveSyncServices(): IDictionary<any> {
		return {
			android: (_device: Mobile.IDevice, $injector: IInjector): IPlatformLiveSyncService => {
				if(!this.platformSpecificLiveSyncServicesCache[_device.deviceInfo.identifier]) {
					this.platformSpecificLiveSyncServicesCache[_device.deviceInfo.identifier] = $injector.resolve(this.$androidLiveSyncServiceLocator.factory, {_device: _device});
				}

				return this.platformSpecificLiveSyncServicesCache[_device.deviceInfo.identifier];
			},
			ios: (_device: Mobile.IDevice, $injector: IInjector) => {
				if(!this.platformSpecificLiveSyncServicesCache[_device.deviceInfo.identifier]) {
					this.platformSpecificLiveSyncServicesCache[_device.deviceInfo.identifier] = $injector.resolve(this.$iosLiveSyncServiceLocator.factory, {_device: _device});
				}

				return this.platformSpecificLiveSyncServicesCache[_device.deviceInfo.identifier];
			}
		};
	}

	public buildForDevice(device: Mobile.IDevice): IFuture<string> {
		return (() => {
			this.$platformService.buildForDeploy(device.deviceInfo.platform, {buildForDevice: !device.isEmulator}).wait();
			let platformData = this.$platformsData.getPlatformData(device.deviceInfo.platform);
			if (device.isEmulator) {
				return this.$platformService.getLatestApplicationPackageForEmulator(platformData).wait().packageName;
			}

			return this.$platformService.getLatestApplicationPackageForDevice(platformData).wait().packageName;
		}).future<string>()();
	}

	public preparePlatformForSync(platform: string): IFuture<void> {
		return (() => {
			if (!this.$platformService.preparePlatform(platform).wait()) {
				this.$logger.out("Verify that listed files are well-formed and try again the operation.");
			}
		}).future<void>()();
	}

	public canExecuteFastSync(filePath: string, platform: string): boolean {
		let platformData = this.$platformsData.getPlatformData(platform);
		let fastSyncFileExtensions = LiveSyncProvider.FAST_SYNC_FILE_EXTENSIONS.concat(platformData.fastLivesyncFileExtensions);
		return _.includes(fastSyncFileExtensions, path.extname(filePath));
	}

	public transferFiles(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string, isFullSync: boolean): IFuture<void> {
		return (() => {
			if (deviceAppData.platform.toLowerCase() === "android" || !deviceAppData.deviceSyncZipPath || !isFullSync) {
				deviceAppData.device.fileSystem.transferFiles(deviceAppData, localToDevicePaths).wait();
			} else {
				temp.track();
				let tempZip = temp.path({prefix: "sync", suffix: ".zip"});
				this.$logger.trace("Creating zip file: " + tempZip);
				this.$childProcess.spawnFromEvent("zip", [ "-r", "-0", tempZip, "app", "-x", "app/tns_modules/*" ], "close", { cwd: path.dirname(projectFilesPath) }).wait();

				deviceAppData.device.fileSystem.transferFiles(deviceAppData, [{
					getLocalPath: () => tempZip,
					getDevicePath: () => deviceAppData.deviceSyncZipPath,
					getRelativeToProjectBasePath: () => "../sync.zip",
					deviceProjectRootPath: deviceAppData.deviceProjectRootPath
				}]).wait();
			}
		}).future<void>()();
	}
}
$injector.register("liveSyncProvider", LiveSyncProvider);
