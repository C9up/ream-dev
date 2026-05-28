import { Emitter } from "@c9up/pulsar/events";
import app from "@c9up/ream/services/app";
import TaskDeclared from "./events/TaskDeclared.js";
import TaskTransitioned from "./events/TaskTransitioned.js";
import LogTaskEvent from "./listeners/LogTaskEvent.js";
import LogTaskTransition from "./listeners/LogTaskTransition.js";

const emitter = app.container.make<Emitter>(Emitter);

emitter.on(TaskDeclared, LogTaskEvent);
emitter.on(TaskTransitioned, LogTaskTransition);
