// The page owns its markup and mounts one widget per placeholder. widget.mjs
// re-exports `mount` from the build, whose file names change on every build.
import {mount} from './widget.mjs';

const answers = [];
const status = document.getElementById('answers');
const disposers = [...document.querySelectorAll('.widget')].map(element =>
  mount(element, {question: element.dataset.question}, {
    answered(helpful) {
      answers.push(helpful ? 'yes' : 'no');
      status.textContent = 'Answers: ' + answers.join(', ');
    },
  }));

document.getElementById('remove').addEventListener('click', () => {
  for (const dispose of disposers.splice(0)) dispose();
  status.textContent = 'Feedback removed';
});
