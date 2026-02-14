function hideme() {
  $('.hideme').css('cursor','pointer').click(e => {
    e.stopImmediatePropagation();
    $(e.target).next().toggle();
  });
};

hideme();

//----------------------------------------------------------

class page {
  copyCrypto(name, address) {
    navigator.clipboard.writeText(address).then(() => {
      this.alert("Support the project",`${name} address copied to clipboard! Thank you for your support`)
    }).catch(err => {
      console.error('Could not copy text: ', err);
      prompt(`Copy ${name} address:`, address);
    });
  }

  alert(title,message,ok) {
    const modalElement = document.getElementById('alert');
    const modal = new bootstrap.Modal(modalElement);
    const cancelBtn = document.getElementById('btnCancel');
    if(ok) cancelBtn.style.display = 'block';
    else cancelBtn.style.display = 'none';
    const okBtn = document.getElementById('btnOk');
    $('#alert_title').html(title);
    $('#alert_message').html(message)
    modal.show();
    cancelBtn.onclick = () => { modal.hide() };
    okBtn.onclick = () => { modal.hide(); if(ok) ok() };
  }
}

var P = new page();
