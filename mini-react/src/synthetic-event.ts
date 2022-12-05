function createSyntheticEvent(Interface: object) {
	return class SyntheticBaseEvent {
		reactEventName: string;
		eventName: string;
		targetInst: object;
		nativeEvent: Event;
		nativeEventTarget: EventTarget | null;
		currentTarget: object | null;

		constructor(
			reactEventName: string,
			eventName: string,
			targetInst: object,
			nativeEvent: Event
		) {
			this.reactEventName = reactEventName;
			this.eventName = eventName;
			this.targetInst = targetInst;
			this.nativeEvent = nativeEvent;
			this.nativeEventTarget = nativeEvent.target;
			this.currentTarget = null;

			for (const propName in Interface) {
				this[propName] = nativeEvent[propName];
			}
		}

		isDefaultPrevented = () => false;
		isPropagationStopped = () => false;

		preventDefault() {
			const event = this.nativeEvent;
			if (event.preventDefault) {
				event.preventDefault();
			} else {
				event.returnValue = false;
			}

			this.isDefaultPrevented = () => true;
		}

		stopPropagation() {
			const event = this.nativeEvent;
			if (event.stopPropagation) {
				event.stopPropagation();
			} else {
				event.cancelBubble = true;
			}

			this.isPropagationStopped = () => true;
		}
	};
}

const MouseEventInterface = {
	clientX: 0,
	clientY: 0,
}

const SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface);

const discreteEventPairsForSimpleEventPlugin: string[] = [
	'click', 'Click',
	'keydown', 'KeyDown',
	'keypress', 'KeyPress',
	'keyup', 'KeyUp',
	'mousedown', 'MouseDown',
	'mouseup', 'MouseUp'
]

const eventNameToReactEventNameMap: Map<string, string> = new Map();
const allNativeEvents: Set<string> = new Set();

(function registerSimpleEvents() {
	for(let i=0; i<discreteEventPairsForSimpleEventPlugin.length; i+=2) {
		const eventName = discreteEventPairsForSimpleEventPlugin[i];
		const reactEventName = `on${discreteEventPairsForSimpleEventPlugin[i+1]}`;
		eventNameToReactEventNameMap.set(eventName, reactEventName);

		allNativeEvents.add(eventName);
	}
})()

function listenToAllSupportedEvents(container: Node): void {
	allNativeEvents.forEach(eventName => {
		listenToNativeEvent(eventName, false, container);
		listenToNativeEvent(eventName, true, container);
	})
}

function listenToNativeEvent(eventName: string, isCaptruePhaseListener: boolean, rootContainerElement: Node) {
	const listener = dispatchEvent.bind(null, eventName, isCaptruePhaseListener);

	if (isCaptruePhaseListener) {
		rootContainerElement.addEventListener(eventName, listener, true);
	} else {
		rootContainerElement.addEventListener(eventName, listener, false);
	}
}

function dispatchEvent (eventName: string, isCaptruePhaseListener: boolean, nativeEvent: Event) {
	const target = nativeEvent.target || nativeEvent.srcElement || window;

	const targetInst = target.__reactFiber;

	dispatchEventForPluginEventSystem(
		eventName,
		isCaptruePhaseListener,
		nativeEvent,
		targetInst,
	);
}

function dispatchEventForPluginEventSystem(eventName: string, isCaptruePhaseListener: boolean, nativeEvent: Event, targetInst: any) {
	const dispatchQueue: any[] = [];

	extractEvents(
		dispatchQueue,
		eventName,
		targetInst,
		nativeEvent,
		isCaptruePhaseListener,
	);

	processDispatchQueue(dispatchQueue, isCaptruePhaseListener);
}

function extractEvents(
	dispatchQueue: any[],
	eventName: string,
	targetInst: any,
	nativeEvent: any,
	isCaptruePhaseListener: boolean,
) {
	const reactEventName = eventNameToReactEventNameMap.get(eventName)!;
	let SyntheticEventCtor = null;

	switch(eventName) {
		case 'click':
			SyntheticEventCtor = SyntheticMouseEvent;
			break;
		default:
			break;
	}

	const listeners = accumulateSinglePhaseListeners(targetInst, reactEventName, isCaptruePhaseListener);

	if (listeners && listeners.length) {
		const syntheticEvent = new SyntheticEventCtor!(
			reactEventName,
			eventName,
			targetInst,
			nativeEvent
		);

		dispatchQueue.push({
			event: syntheticEvent,
			listeners,
		});
	}
}

function accumulateSinglePhaseListeners(targetFiber: object, reactEventName: string, isCapturePhase: boolean) {
	const captureName = `${reactEventName}Capture`;
	const _reactEventName = isCapturePhase ? captureName : reactEventName;

	const listeners = [];

	let fiber = targetFiber;
	while(fiber) {
		const stateNode = fiber.stateNode;
		const listener = stateNode.__reactFiber[_reactEventName];
		if (listener) {
			listeners.push([fiber, listener]);
		}

		fiber = fiber.return;
	}

	return listeners;
}

function processDispatchQueue(dispatchQueue: [], isCaptruePhaseListener: boolean) {
	for(let i=0; i<dispatchQueue.length;i++) {
		const { event, listeners } = dispatchQueue[i];

		if (isCaptruePhaseListener) {
			for(let i = listeners.length-1; i>=0; i--) {
				if (event.isPropagationStopped()) {
					return;
				}
				const [currentTarget, listener] = listeners[i];
				execDispatch(event, listener, currentTarget);
			}
		} else {
			for(let i = 0; i<listeners.length; i++) {
				if (event.isPropagationStopped()) {
					return;
				}
				const [currentTarget, listener] = listeners[i];
				execDispatch(event, listener, currentTarget);
			}
		}
	}
}

function execDispatch(event: any, listener: Function, currentTarget: EventTarget) {
	event.currentTarget = currentTarget;
	listener(event);
	event.currentTarget = null;
}
