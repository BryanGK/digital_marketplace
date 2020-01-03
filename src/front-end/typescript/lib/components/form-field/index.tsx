import { FORM_FIELD_DEBOUNCE_DURATION } from 'front-end/config';
import { ComponentViewProps, Dispatch, immutable, Immutable, mapComponentDispatch, updateComponentChild, View, ViewElement, ViewElementChildren } from 'front-end/lib/framework';
import * as framework from 'front-end/lib/framework';
import Icon from 'front-end/lib/views/icon';
import { debounce } from 'lodash';
import React, { CSSProperties } from 'react';
import { Alert, FormGroup, FormText, Label } from 'reactstrap';
import { ADT } from 'shared/lib/types';
import { getInvalidValue, getValidValue, isValid as isValidValidation, Validation } from 'shared/lib/validation';

export interface ChildStateBase<Value> {
  value: Value;
  id: string;
}

export type ChildParamsBase<Value> = ChildStateBase<Value>;

// Allows child components to trigger state validation.
export type ChildMsg<InnerChildMsg> = InnerChildMsg | ADT<'@validate'>;

export interface ChildProps<Value, ChildState extends ChildStateBase<Value>, InnerChildMsg> {
  state: Immutable<ChildState>;
  dispatch: Dispatch<ChildMsg<InnerChildMsg>>;
  validityClassName: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  onChange(value: Value): void;
}

export type ChildComponent<Value, ChildParams extends ChildParamsBase<Value>, ChildState extends ChildStateBase<Value>, InnerChildMsg, ExtraChildProps = {}> = framework.Component<ChildParams, ChildState, ChildMsg<InnerChildMsg>, ChildProps<Value, ChildState, InnerChildMsg> & ExtraChildProps>;

export interface State<Value, ChildState extends ChildStateBase<Value>> {
  errors: string[];
  showHelp: boolean;
  child: Immutable<ChildState>;
  validate?(value: Value): Validation<Value>;
}

export interface Params<Value, ChildParams extends ChildParamsBase<Value>> {
  errors: string[];
  child: ChildParams;
  validate?(value: Value): Validation<Value>;
}

export type Msg<InnerChildMsg>
  = ADT<'toggleHelp'>
  | ADT<'validate'>
  | ADT<'child', ChildMsg<InnerChildMsg>>;

export interface ViewProps<Value, ChildState extends ChildStateBase<Value>, InnerChildMsg, ExtraChildProps = {}> extends ComponentViewProps<State<Value, ChildState>, Msg<InnerChildMsg>> {
  extraChildProps: ExtraChildProps;
  className?: string;
  labelClassName?: string;
  style?: CSSProperties;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  help?: ViewElementChildren;
}

export type Component<Value, ChildParams extends ChildParamsBase<Value>, ChildState extends ChildStateBase<Value>, InnerChildMsg, ExtraChildProps = {}> = framework.Component<Params<Value, ChildParams>, State<Value, ChildState>, Msg<InnerChildMsg>, ViewProps<Value, ChildState, InnerChildMsg, ExtraChildProps>>;

function makeInit<Value, ChildParams extends ChildParamsBase<Value>, ChildState extends ChildStateBase<Value>, InnerChildMsg, ExtraChildProps>(childInit: ChildComponent<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>['init']): Component<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>['init'] {
  return async params => ({
    id: params.child.id,
    errors: params.errors,
    showHelp: false,
    child: immutable(await childInit(params.child)),
    validate: params.validate
  });
}

function validate<Value, ChildState extends ChildStateBase<Value>>(state: Immutable<State<Value, ChildState>>): Immutable<State<Value, ChildState>> {
  return state.validate
    ? validateAndSetValue(state, getValue(state), state.validate)
    : state;
}

function makeUpdate<Value, ChildParams extends ChildParamsBase<Value>, ChildState extends ChildStateBase<Value>, InnerChildMsg, ExtraChildProps>(childUpdate: ChildComponent<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>['update']): Component<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>['update'] {
  return ({ state, msg }) => {
    switch (msg.tag) {
      case 'toggleHelp':
        return [
          state.update('showHelp', v => !v)
        ];
      case 'validate':
        return [state, async state => validate(state)];
      case 'child':
        const result = updateComponentChild({
          state,
          mapChildMsg: value => ({ tag: 'child', value } as const),
          childStatePath: ['child'],
          childUpdate,
          childMsg: msg.value
        });
        return [
          result[0],
          async (state, dispatch) => {
            if (msg.value && (msg.value as ADT<'@validate'>).tag === '@validate') {
              dispatch({ tag: 'validate', value: undefined });
            }
            if (result[1]) {
              return await result[1](state, dispatch);
            } else {
              return null;
            }
          }
        ];
      default:
        return [state];
    }
  };
}

function ConditionalHelpToggle<Value, ChildState extends ChildStateBase<Value>, InnerChildMsg>(props: ViewProps<Value, ChildState, InnerChildMsg>): ViewElement<ViewProps<Value, ChildState, InnerChildMsg>> {
  const { dispatch, help } = props;
  if (help) {
    return (
      <Icon
        hover
        name='question-circle'
        color='info'
        width={1}
        height={1}
        className='mt-n1 ml-2 flex-shrink-0 d-inline'
        onClick={e => {
          dispatch({ tag: 'toggleHelp', value: undefined });
          e.preventDefault();
        }} />
    );
  } else {
    return null;
  }
}

export const ViewRequiredAsterisk: View<{}> = () => {
  return (<span className='font-weight-bold text-warning ml-1'>*</span>);
};

function ConditionalLabel<Value, ChildState extends ChildStateBase<Value>, InnerChildMsg>(props: ViewProps<Value, ChildState, InnerChildMsg>): ViewElement<ViewProps<Value, ChildState, InnerChildMsg>> {
  const { state, label, required, disabled, labelClassName } = props;
  const className = `font-weight-bold ${labelClassName || ''}`;
  if (label) {
    return (
      <Label for={state.child.id} className={className}>
        <span>
          {label}
          {required && !disabled ? (<ViewRequiredAsterisk />) : null}
          <ConditionalHelpToggle {...props} />
        </span>
      </Label>
    );
  } else {
    return null;
  }
}

function ConditionalHelp<Value, ChildState extends ChildStateBase<Value>, InnerChildMsg>(props: ViewProps<Value, ChildState, InnerChildMsg>): ViewElement<ViewProps<Value, ChildState, InnerChildMsg>> {
  const { state, help } = props;
  if (help && state.showHelp) {
    return (
      <Alert color='info' style={{ whiteSpace: 'pre-line' }}>
        {help}
      </Alert>
    );
  } else {
    return null;
  }
}

function ConditionalErrors<Value, ChildState extends ChildStateBase<Value>, InnerChildMsg>(props: ViewProps<Value, ChildState, InnerChildMsg>): ViewElement<ViewProps<Value, ChildState, InnerChildMsg>> {
  const { state } = props;
  if (state.errors.length) {
    const errorElements = state.errors.map((error, i) => {
      return (<div key={`form-field-conditional-errors-${i}`}>{error}</div>);
    });
    return (
      <FormText color='danger'>
        {errorElements}
      </FormText>
    );
  } else {
    return null;
  }
}

function makeView<Value, ChildParams extends ChildParamsBase<Value>, ChildState extends ChildStateBase<Value>, InnerChildMsg, ExtraChildProps>(ChildView: ChildComponent<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>['view']): Component<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>['view'] {
  const debouncedValidate = debounce((dispatch: Dispatch<Msg<InnerChildMsg>>) => dispatch({
    tag: 'validate',
    value: undefined
  }), FORM_FIELD_DEBOUNCE_DURATION);
  return props => {
    const { state, dispatch, style, extraChildProps } = props;
    const invalid = !!state.errors.length;
    const childClassName = 'flex-grow-1 align-self-stretch';
    const validityClassName = invalid ? 'is-invalid' : '';
    return (
      <FormGroup className={`form-field-${state.child.id} d-flex flex-column ${props.className || ''}`} style={style}>
        <ConditionalLabel {...props} />
        <ConditionalHelp {...props} />
        <ChildView
          {...extraChildProps}
          state={state.child}
          className={childClassName}
          validityClassName={validityClassName}
          disabled={props.disabled}
          placeholder={props.placeholder}
          dispatch={mapComponentDispatch(dispatch, value => ({ tag: 'child' as const, value }))}
          onChange={() => debouncedValidate(dispatch)} />
        <ConditionalErrors {...props} />
      </FormGroup>
    );
  };
}

export function makeComponent<Value, ChildParams extends ChildParamsBase<Value>, ChildState extends ChildStateBase<Value>, InnerChildMsg, ExtraChildProps = {}>(params: ChildComponent<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>): Component<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps> {
  return {
    init: makeInit(params.init),
    update: makeUpdate(params.update),
    //Need to type cast here because the compiler's inference is failing.
    view: makeView(params.view) as Component<Value, ChildParams, ChildState, InnerChildMsg, ExtraChildProps>['view']
  };
}

export function getValue<Value, ChildState extends ChildStateBase<Value>>(state: Immutable<State<Value, ChildState>>): Value {
  return state.child.value;
}

export function setValue<Value, ChildState extends ChildStateBase<Value>>(state: Immutable<State<Value, ChildState>>, value: Value): Immutable<State<Value, ChildState>> {
  return state.update('child', child => child.set('value', value));
}

export function setErrors<Value, ChildState extends ChildStateBase<Value>>(state: Immutable<State<Value, ChildState>>, errors: string[]): Immutable<State<Value, ChildState>> {
  return state.set('errors', errors);
}

export function validateAndSetValue<Value, ChildState extends ChildStateBase<Value>>(state: Immutable<State<Value, ChildState>>, value: Value, validate: (value: Value) => Validation<Value>): Immutable<State<Value, ChildState>> {
  const validation = validate(value);
  return setErrors(state, getInvalidValue(validation, []))
    // Use setIn because the compiler can't reconcile ChildState['value'] and Value
    .update('child', child => child.setIn(['value'], getValidValue(validation, value)));
}

export function isValid<Value, ChildState extends ChildStateBase<Value>>(state: Immutable<State<Value, ChildState>>): boolean {
  return state.validate ? isValidValidation(state.validate(getValue(state))) : !state.errors.length;
}
