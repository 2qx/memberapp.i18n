"use strict";

// Handle populating followers, following, blocking and blockers
function getAndPopulateFollowAction(qaddress, action, page, elementId, htmlText) {
    show(page);
    getJSON(dropdowns.contentserver + '?action='+ action +'&qaddress=' + qaddress + '&address=' + pubkey).then(function (data) {
        var contents = "";
        for (var i = 0; i < data.length; i++) {
            contents = contents + getMembersWithRatingHTML(i,page,data[i],htmlText,false);
        }

        document.getElementById(elementId).innerHTML = contents;
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

