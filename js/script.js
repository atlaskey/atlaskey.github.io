function hideme() {
  $('.hideme').css('cursor','pointer').click(e => {
    e.stopImmediatePropagation();
    $(e.target).next().toggle();
  });
};

hideme();

//----------------------------------------------------------

class page {
  ask() {
    const modalElement = document.getElementById('ask');
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
  }
  
  copy(coin) {
    navigator.clipboard.writeText($('#a_'+coin).html());
    $('#message').html(coin+' address copied to clipboard!')
  }
  
  clear(){
    $('#message').html('')
  }
}

var P = new page();
