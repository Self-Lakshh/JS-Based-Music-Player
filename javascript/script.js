var queryCount = 0;

document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("user-input-form");
    var queryInput = document.getElementById("query");
    var introSection = document.querySelector(".chat-intro");

    
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        sendMessage(); 
    });

    
