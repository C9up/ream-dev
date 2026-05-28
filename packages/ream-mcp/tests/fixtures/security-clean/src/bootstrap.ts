declare class ShieldMiddleware {
	constructor(opts?: object);
}

export function bootstrap(): void {
	new ShieldMiddleware({});
}
