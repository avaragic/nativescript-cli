import * as net from "net";
import Future = require("fibers/future");

export class Net implements INet {
	constructor(private $logger: ILogger) { }

	public getFreePort(): IFuture<number> {
		return ((): number => {
			let server = net.createServer((sock: string) => { /* empty - noone will connect here */ });

			let createServerFuture = new Future<number>();

			server.listen(0, () => {
				let portUsed = server.address().port;
				server.close();

				if (!createServerFuture.isResolved()) {
					createServerFuture.return(portUsed);
				}
			});

			server.on("error", (err: Error) => {
				if (!createServerFuture.isResolved()) {
					createServerFuture.throw(err);
				}
			});

			return createServerFuture.wait();
		}).future<number>()();
	}
}
$injector.register("net", Net);