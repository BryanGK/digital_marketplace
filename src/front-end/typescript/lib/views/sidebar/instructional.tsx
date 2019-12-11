import { ComponentView, ComponentViewProps, View } from 'front-end/lib/framework';
import Icon from 'front-end/lib/views/icon';
import Link from 'front-end/lib/views/link';
import Sticky from 'front-end/lib/views/sidebar/lib/sticky';
import React from 'react';

interface Params<State, Msg> {
  getFooter: ComponentView<State, Msg>;
  backMsg?: Msg;
  getTitle(state: State): string;
  getDescription(state: State): string;
}

function makeSidebar<State, Msg, Props extends ComponentViewProps<State, Msg> = ComponentViewProps<State, Msg>>(params: Params<State, Msg>): View<Props> {
  const { getFooter, backMsg, getTitle, getDescription } = params;
  return props => {
    const { state, dispatch } = props;
    return (
      <div className='flex-grow-1 position-relative'>
        <Sticky>
          <Link
            color='secondary'
            style={{ top: 0, left: 0 }}
            className={`font-size-small d-flex flex-row flex-nowrap align-items-center mt-n5 position-absolute ${backMsg ? '' : 'd-none'}`}
            onClick={() => backMsg && dispatch(backMsg)}>
            <Icon name='chevron-left' width={1} height={1.1} />Go Back
          </Link>
          <h1 className='mb-3 font-weight-bolder'>{getTitle(state)}</h1>
          <p className='mb-4'>{getDescription(state)}</p>
          <div className='font-size-small'>{getFooter(props)}</div>
        </Sticky>
      </div>
  );
  };
}

export default makeSidebar;