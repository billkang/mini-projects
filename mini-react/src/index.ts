interface VirtualDom {
	type: string;
	props: {
		children: VirtualDom[];
		[propName: string]: any;
	};
}

type HookState = object | string | number | boolean | null;

interface Hook {
	state: HookState;
	queue: [];
}

interface Fiber {
	type?: string | Function;
	props: {
		children: Fiber[];
		[propName: string]: any;
	};
	dom?: Node | null;
	alternate?: Fiber | null;
	effectTag?: string;
	hooks?: Hook[];
	parent?: Fiber;
	child?: Fiber;
	sibling?: Fiber;
}

enum EffectTag {
	UPDATE = 'UPDATE',
	PLACEMENT = 'PLACEMENT',
	DELETION = 'DELETION',
}

interface Deadline {
	timeRemaining: Function;
}

type BoolFunc = (key: string) => boolean;

function createElement(
	type: string,
	props: object,
	...children: Array<VirtualDom | string>
): VirtualDom {
	return {
		type,
		props: {
			...props,
			children: children.map((child) =>
				typeof child === "object" ? child : createTextElement(child)
			),
		},
	};
}

function createTextElement(text: string): VirtualDom {
	return {
		type: "TEXT_ELEMENT",
		props: {
			nodeValue: text,
			children: [],
		},
	};
}

let wipRoot: Fiber | null  = null;
let wipFiber: Fiber | null = null;
let hookIndex: number = 0;
let currentRoot: Fiber | null  = null;
let nextUnitOfWork: Fiber | null = null;
let deletions: Fiber[] = [];

function workLoop(deadline: Deadline) {
	let shouldYield = false;

	while(nextUnitOfWork && !shouldYield) {
		nextUnitOfWork = performUnitOfWork(nextUnitOfWork);

		shouldYield = deadline.timeRemaining() < 1;
	}

	if (!nextUnitOfWork && wipRoot) {
		commitRoot();
	}

	requestIdleCallback(workLoop);
}

function updateFunctionComponent(fiber: Fiber) {
	wipFiber = fiber;
	hookIndex = 0;
	wipFiber.hooks = [];

	const children = [(fiber.type as Function)(fiber.props)];

	reconcileChildren(fiber, children);
}

function updateHostComponent(fiber: Fiber) {
	if (!fiber.dom) {
		fiber.dom = createDom(fiber);
	}

	reconcileChildren(fiber, fiber.props.children);
}

requestIdleCallback(workLoop);

function performUnitOfWork(fiber: Fiber): Fiber | null {
	const isFunctionComponent = (fiber.type as any) instanceof Function;

	if (isFunctionComponent) {
		updateFunctionComponent(fiber);
	} else {
		updateHostComponent(fiber);
	}

	if(fiber.child) {
		return fiber.child;
	}

	let nextFiber: Fiber | undefined = fiber;
	while(nextFiber) {
		if(nextFiber.sibling) {
			return nextFiber.sibling;
		}

		nextFiber = nextFiber.parent;
	}

	return null;
}

function reconcileChildren(wipFiber: Fiber, elements: Fiber[]) {
	let index: number = 0;
	let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
	let prevSibling: Fiber | null = null;

	while(index < elements.length || oldFiber !== null) {
		const element = elements[index];
		let newFiber = null;

		const sameType = oldFiber && element && oldFiber.type === element.type;

		if (sameType) {
			newFiber = {
				type: oldFiber?.type,
				props: element.props,
				dom: oldFiber?.dom,
				parent: wipFiber,
				alternate: oldFiber,
				effectTag: EffectTag.UPDATE,
			}
		}

		if(element && !sameType) {
			newFiber = {
				type: element.type,
				props: element.props,
				dom: null,
				parent: wipFiber,
				alternate: null,
				effectTag: EffectTag.PLACEMENT,
			}
		}

		if (oldFiber && !sameType) {
			oldFiber.effectTag = EffectTag.DELETION;
			deletions.push(oldFiber);
		}

		if (oldFiber) {
			oldFiber = oldFiber.sibling;
		}

		if(index === 0) {
			wipFiber.child = newFiber!;
		} else {
			prevSibling!.sibling = newFiber!;
		}

		prevSibling = newFiber;
		index++;
	}
}

function createDom(fiber: Fiber): Node {
	const dom: Node = fiber.type === 'TEXT_ELEMENT'
		? document.createTextNode('')
		: document.createElement(fiber.type!);

		Object.keys(fiber.props)
			.filter(isProperty)
			.forEach((name) => {
				dom[name] = fiber.props[name];
			});

	return dom;
}

const isEvent = (key: string): boolean => key.startsWith('on');
const isProperty = (key: string): boolean => key !== 'children' && !isEvent(key);
const isNew = (prev: object, next: object): BoolFunc => (key: string): boolean => prev[key] !== next[key];
const isGone = (prev: object, next: object): BoolFunc => (key: string): boolean => !(key in next)

function updateDom(dom: Node, prevProps: object, nextProps: object): void {
	Object.keys(prevProps)
		.filter(isEvent)
		.filter((key: string): boolean => !(key in nextProps) || isNew(prevProps, nextProps)(key))
		.forEach(key => {
			const eventType = key.toLocaleLowerCase().substring(2);
			dom.removeEventListener(eventType, prevProps[key]);
		});

	Object.keys(prevProps)
		.filter(isProperty)
		.filter(isGone(prevProps, nextProps))
		.forEach(key => {
			dom[key] = '';
		});

	Object.keys(nextProps)
		.filter(isProperty)
		.filter(isNew(prevProps, nextProps))
		.forEach(key => {
			dom[key] = nextProps[key];
		});

	Object.keys(nextProps)
		.filter(isEvent)
		.filter((key: string): boolean => isNew(prevProps, nextProps)(key))
		.forEach(key => {
			const eventType = key.toLocaleLowerCase().substring(2);
			dom.addEventListener(eventType, nextProps[key]);
		});
}

function commitDeletion(fiber: Fiber, domParent: Node) {
	if (fiber.dom) {
		domParent.removeChild(fiber.dom);
	} else {
		commitDeletion(fiber.child!, domParent);
	}
}

function commitRoot(): void {
	deletions?.forEach(commitWork)

	commitWork(wipRoot!.child!);
	currentRoot = wipRoot;
	wipRoot = null;
}

function commitWork(fiber: Fiber): void {
	if(!fiber) {
		return;
	}

	let parentFiber = fiber.parent;
	while(!parentFiber?.dom) {
		parentFiber = parentFiber?.parent;
	}

	const domParent = parentFiber.dom;

	if (fiber.effectTag === EffectTag.PLACEMENT && fiber.dom) {
		domParent?.appendChild(fiber.dom!);
	} else if (fiber.effectTag === EffectTag.UPDATE) {
		updateDom(fiber.dom!, fiber.alternate?.props!, fiber.props);
	} else if (fiber.effectTag === EffectTag.DELETION) {
		commitDeletion(fiber, domParent);
	}

	commitWork(fiber.child!);
	commitWork(fiber.sibling!);
}

function render(element: VirtualDom, container: Node): void {
	wipRoot = {
		dom: container,
		props: {
			children: [element]
		},
		alternate: currentRoot,
	}

	deletions = [];

	nextUnitOfWork = wipRoot;
}

function useState(initial: HookState) {
	const oldHook = wipFiber?.alternate?.hooks[hookIndex];
	const hook = {
		state: oldHook ? oldHook.state : initial,
		queue: [],
	}

	const actions = oldHook ? oldHook.queue : [];
	actions.forEach(action => hook.state = action(hook.state));

	const setState = action => {
		hook.queue.push(action);

		wipRoot = {
			dom: currentRoot?.dom,
			props: currentRoot?.props,
			alternate: currentRoot
		}

		nextUnitOfWork = wipRoot
		deletions = []
	}

	wipFiber?.hooks?.push(hook);
	hookIndex++;

	return [hook.state, setState];
}

const MiniReact = {
	createElement,
	render,
};

export default MiniReact;
