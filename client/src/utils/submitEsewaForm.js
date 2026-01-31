export function submitEsewaForm(epayUrl, formFields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = epayUrl;

  Object.entries(formFields).forEach(([k, v]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = String(v);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
