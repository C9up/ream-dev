import { EventListener } from "fake-pulsar";

export class UserRegistered {
	static EVENT_NAME = "user.registered";
	constructor(public userId: string) {}
}

@EventListener("user.registered")
export class WelcomeEmailListener {
	handle(event: UserRegistered) {
		// send welcome email
	}
}
