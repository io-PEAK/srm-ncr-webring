const gradDateInput = document.getElementById('gradDate');
const today = new Date();
const maxDate = new Date();
maxDate.setFullYear(today.getFullYear() + 10);

flatpickr('#gradDate', {
  dateFormat: 'Y-m-d',
  minDate: today,
  maxDate: maxDate,
});

// Only runs when the form is submitted
document.getElementById('joinForm').addEventListener('submit', (event) => {
  event.preventDefault();

  const gradDateValue = gradDateInput.value;
  const gradDate = new Date(gradDateValue);

if (gradDate <= today) {
  alert('Graduation date must be in the future.');
  return;
}

if (gradDate > maxDate) {
  alert('Graduation date seems too far in the future. Please check the year.');
  return;
}

  const entry = {
    name: document.getElementById('name').value,
    website: document.getElementById('website').value,
    program: document.getElementById('program').value,
    gradDate: gradDateValue,
    email: document.getElementById('email').value,
    badge: document.getElementById('badge').value,
    location: document.getElementById('location').value,
  };

  document.getElementById('output').textContent = JSON.stringify(entry, null, 2);
});