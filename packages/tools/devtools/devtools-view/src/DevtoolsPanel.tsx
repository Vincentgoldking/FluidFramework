/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IMessageRelay } from "@fluid-experimental/devtools-core";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { DevtoolsView } from "./DevtoolsView";
import { MessageRelayContext } from "./MessageRelayContext";
import { ConsoleVerboseLogger, LoggerContext } from "./TelemetryUtils";

/**
 * {@link DevtoolsPanel} input props.
 */
export interface DevtoolsPanelProps {
	/**
	 * An instance of {@link @fluid-experimental/devtools-core#IMessageRelay} that can handle message passing between the
	 * devtools's "brain" and its UI, in whatever context the latter is being rendered (e.g. in the same page as the
	 * application, or in the browser's Devtools panel).
	 */
	messageRelay: IMessageRelay;

	/**
	 * An optional {@link @fluidframework/common-definitions#ITelemetryBaseLogger} instance that will be passed any usage
	 * telemetry generated by Devtools.
	 *
	 * @remarks
	 * We're only interested in usage telemetry when Devtools runs as a browser extension.
	 * While technically this logger can also be provided in our example applications where we render the Devtools panel
	 * inline with the app, it should *not* be used in those cases.
	 */
	usageTelemetryLogger?: ITelemetryBaseLogger;
}

/**
 * Top-level view for the Fluid Devtools.
 *
 * @remarks
 *
 * Initializes the message relay context required by internal components.
 */
export function DevtoolsPanel(props: DevtoolsPanelProps): React.ReactElement {
	const { usageTelemetryLogger, messageRelay } = props;
	const consoleLogger = new ConsoleVerboseLogger(usageTelemetryLogger);
	const topLevelLogger = ChildLogger.create(consoleLogger);
	topLevelLogger?.sendTelemetryEvent({ eventName: "DevtoolsPanelRendered" });

	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<LoggerContext.Provider value={topLevelLogger}>
				<DevtoolsView />
			</LoggerContext.Provider>
		</MessageRelayContext.Provider>
	);
}
