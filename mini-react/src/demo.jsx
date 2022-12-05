import React from './mini-react';

function Counter(){
  const [state, setState] = React.useState(1);

  return (
    <h1 onClick={() => setState(c => c + 1)}>
      Count: { state }
    </h1>
  )
}

const element = <Counter />

const container = document.getElementById("root");
React.render(element, container)
