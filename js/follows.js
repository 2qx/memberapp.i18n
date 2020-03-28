"use strict";

// Handle followers, following, blocking and blockers
function getAndPopulateFollowAction(qaddress, action, page) {
    show('followers');
    var page=page;
    getJSON(dropdowns.contentserver + '?action='+ action +'&qaddress=' + qaddress + '&address=' + pubkey).then(function (data) {
        var contents = "";
        for (var i = 0; i < data.length; i++) {
            contents = contents + getMembersWithRatingHTML(i,page,data[i],"Follows",false);
        }

        document.getElementById('follows').innerHTML = contents;
        var disable=false;
        if(qaddress!=pubkey){
            disable=true;
        }
        addStarRatings(data,page,disable);
    }, function (status) { //error detection....
        console.log('Something is wrong:'+status);
        document.getElementById(page).innerHTML = 'Something is wrong:'+status;
        updateStatus(status);
    });

}

