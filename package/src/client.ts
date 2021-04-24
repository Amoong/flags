import { nanoid } from "nanoid";
import * as React from "react";
import { isConfigured, config } from "./config";
import {
  InitialFlagState,
  MissingConfigurationError,
  Flags,
  Input,
  Outcome,
  FlagUser,
  Traits,
  FlagBag,
  EvaluationResponseBody,
  ResolvingError,
} from "./types";
import {
  deepEqual,
  getCookie,
  serializeVisitorKeyCookie,
  combineRawFlagsWithDefaultFlags,
  ObjectMap,
} from "./utils";

export type {
  FlagUser,
  Traits,
  Flags,
  MissingConfigurationError,
  InitialFlagState,
  Input,
  Outcome,
} from "./types";

type State<F extends Flags> = {
  current:
    | null
    | {
        input: Input;
        outcome: Outcome<F>;
        error?: never;
      }
    | {
        input: Input;
        outcome: null;
        error: ResolvingError;
        cachedOutcome: Outcome<F> | null;
      };
  pending: null | { input: Input; cachedOutcome: Outcome<F> | null };
};

type Action<F extends Flags> =
  | { type: "evaluate"; input: Input }
  | { type: "revalidate" }
  | { type: "settle/success"; input: Input; outcome: Outcome<F> }
  | { type: "settle/failure"; input: Input; error: ResolvingError };

type Effect = { type: "fetch"; input: Input };

/**
 * Checks whether input is a brand new input.
 *
 * In case there is a pending input, it checks if the incoming input equals that.
 *
 * In case there is no pending input, it checks if the incoming input equals the current input.
 */
function isEmergingInput<F extends Flags>(input: Input, state: State<F>) {
  if (state.pending) {
    if (deepEqual(state.pending.input, input)) return false;
  } else if (state.current /* and not state.pending */) {
    if (deepEqual(state.current.input, input)) return false;
  }
  return true;
}

/**
 * The reducer returns a tuple of [state, effects].
 *
 * effects is an array of effects to execute. The emitted effects are then later
 * executed in another hook.
 *
 * This pattern is basically a hand-rolled version of
 * https://github.com/davidkpiano/useEffectReducer
 *
 * We use a hand-rolled version to keep the size of this package minimal.
 */
function reducer<F extends Flags>(
  tuple: readonly [State<F>, Effect[]],
  action: Action<F>
): readonly [State<F>, Effect[]] {
  const [state /* and effects */] = tuple;
  switch (action.type) {
    // fail hard (turn flags into null if failing)
    case "evaluate": {
      const cachedOutcome = cache.get<Outcome<F>>(action.input);

      return [
        { ...state, pending: { input: action.input, cachedOutcome } },
        [{ type: "fetch", input: action.input }],
      ];
    }
    // fail soft (keep previous flags if failing)
    case "revalidate": {
      const latestInput = state.pending?.input || state.current?.input;
      if (!latestInput) return tuple;

      const cachedOutcome = cache.get<Outcome<F>>(latestInput);
      return [
        { ...state, pending: { input: latestInput, cachedOutcome } },
        [{ type: "fetch", input: latestInput }],
      ];
    }
    case "settle/success": {
      // skip outdated responses
      if (!deepEqual(action.input, state.pending?.input)) return tuple;

      cache.set(action.input, action.outcome);

      // update cookie if response contains visitor key
      const visitorKey = action.outcome.responseBody.visitor?.key;
      if (visitorKey) document.cookie = serializeVisitorKeyCookie(visitorKey);

      return [
        {
          ...state,
          current: { input: action.input, outcome: action.outcome },
          pending: null,
        },
        [],
      ];
    }
    case "settle/failure": {
      // skip outdated responses
      if (!deepEqual(action.input, state.pending?.input)) return tuple;

      return [
        {
          ...state,
          current: {
            input: action.input,
            outcome: null,
            error: action.error,
            cachedOutcome: cache.get<Outcome<F>>(action.input),
          },
          pending: null,
        },
        [],
      ];
    }
    default:
      return tuple;
  }
}

// When ready is undefined, it counts as true
const isReady = (ready: undefined | boolean) => ready === undefined || ready;

export const cache = new ObjectMap<Input, Outcome<Flags>>();

export type UseFlagsOptions<F extends Flags = Flags> =
  | {
      user?: FlagUser | null;
      traits?: Traits | null;
      initialState?: InitialFlagState<F>;
      revalidateOnFocus?: boolean;
      ready?: boolean;
    }
  | undefined;

export function useFlags<F extends Flags = Flags>(
  options: UseFlagsOptions<F> = {}
): FlagBag<F> {
  if (!isConfigured(config)) throw new MissingConfigurationError();

  const [generatedVisitorKey] = React.useState(nanoid);

  const currentUser = options.user || null;
  const currentTraits = options.traits || null;
  const shouldRevalidateOnFocus =
    options.revalidateOnFocus === undefined
      ? config.revalidateOnFocus
      : options.revalidateOnFocus;

  const [[state, effects], dispatch] = React.useReducer(
    reducer,
    options.initialState,
    (initialFlagState): [State<F>, Effect[]] => [
      {
        current: initialFlagState
          ? initialFlagState.outcome
            ? {
                input: initialFlagState.input,
                outcome: initialFlagState.outcome,
              }
            : {
                input: initialFlagState.input,
                outcome: null,
                error: initialFlagState.error,
                cachedOutcome: null,
              }
          : null,
        pending: null,
      },
      [] as Effect[],
    ]
  );

  // add initialState to cache
  React.useEffect(() => {
    if (
      options.initialState &&
      // only cache successful requests
      options.initialState.outcome &&
      // do not cache static requests as they'll always be passed in from the
      // server anyhow, so they'd never be read from the cache
      !options.initialState.input.requestBody.static
    ) {
      cache.set(options.initialState.input, options.initialState.outcome);
    }
  }, [options.initialState]);

  React.useEffect(() => {
    if (!isConfigured(config)) throw new MissingConfigurationError();

    const visitorKey = (() => {
      const cookie =
        typeof document !== "undefined"
          ? getCookie(document.cookie, "hkvk")
          : null;
      if (cookie) return cookie;

      if (state.pending?.input.requestBody.visitorKey)
        return state.pending?.input.requestBody.visitorKey;

      if (state.current?.outcome?.responseBody.visitor?.key)
        return state.current?.outcome?.responseBody.visitor?.key;

      return generatedVisitorKey;
    })();

    const input: Input = {
      endpoint: config.endpoint,
      envKey: config.envKey,
      requestBody: {
        visitorKey,
        user: currentUser,
        traits: currentTraits,
        static: false,
      },
    };

    if (isEmergingInput(input, state) && isReady(options.ready)) {
      dispatch({ type: "evaluate", input });
    }

    if (!shouldRevalidateOnFocus) return;

    function handleFocus() {
      if (document.visibilityState === "visible" && isReady(options.ready)) {
        dispatch({ type: "revalidate" });
      }
    }

    // extracted "visibilitychange" for bundle size
    const visibilityChange = "visibilitychange";
    document.addEventListener(visibilityChange, handleFocus);
    return () => {
      document.removeEventListener(visibilityChange, handleFocus);
    };
  }, [
    state,
    currentUser,
    currentTraits,
    shouldRevalidateOnFocus,
    options.ready,
  ]);

  React.useEffect(() => {
    effects.forEach((effect) => {
      switch (effect.type) {
        // execute the effect
        case "fetch": {
          const { input } = effect;

          fetch([input.endpoint, input.envKey].join("/"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input.requestBody),
          })
            .then(
              async (response) => {
                const responseBody = (await response.json()) as EvaluationResponseBody<F>;
                if (response.ok /* response.status is 200-299 */) {
                  // responses to outdated requests are skipped in the reducer
                  const outcome = { responseBody };
                  dispatch({ type: "settle/success", input, outcome });
                } else {
                  dispatch({
                    type: "settle/failure",
                    input,
                    error: "response-not-ok",
                  });
                }
              },
              () => {
                dispatch({
                  type: "settle/failure",
                  input,
                  error: "invalid-response-body",
                });
              }
            )
            .catch((error) => {
              console.error("HappyKit: Failed to load flags");
              console.error(error);
              dispatch({
                type: "settle/failure",
                input,
                error: "network-error",
              });
            });
        }

        default:
          return;
      }
    });
  }, [effects, dispatch]);

  const defaultFlags = config.defaultFlags;

  const revalidate = React.useCallback(() => dispatch({ type: "revalidate" }), [
    dispatch,
  ]);

  const flagBag = React.useMemo<FlagBag<F>>(() => {
    const rawFlags =
      (state.current?.outcome?.responseBody.flags as F | undefined) || null;

    const flags = combineRawFlagsWithDefaultFlags<F>(rawFlags, defaultFlags);

    // When the outcome was generated for a static site, then no visitor key
    // is present on the outcome. In that case, the state can not be seen as
    // settled as another revalidation will happen in which a visitor key will
    // get generated.
    return {
      flags: rawFlags ? flags : null,
      rawFlags: rawFlags,
      fetching: Boolean(state.pending),
      settled: Boolean(
        state.current && !state.current.input.requestBody.static
      ),
      visitorKey:
        state.current?.outcome?.responseBody.visitor?.key ||
        state.current?.input.requestBody.visitorKey ||
        state.pending?.input.requestBody.visitorKey ||
        null,
      revalidate,
    };
  }, [state, defaultFlags]);

  return flagBag;
}
