jQuery(function() {
  var Kippt = {};

  Kippt.closePopover = function() {
    setTimeout(function() {
      safari.extension.popovers[0].hide();
    }, 0);
  };

  Kippt.openTab = function(url) {
    safari.application.activeBrowserWindow.openTab().url = url;
    Kippt.closePopover();
  };

  Kippt.updateLists = function(data) {
    $('#id_list').html('');
    for (var i in data) {
      var list = data[i];
      $('#id_list').append(new Option(list['title'], list['id'], true, true));
    }
    $('#id_list option').first().attr('selected', 'selected');

    $('#id_list').append('<option id="new-list-toggle">-- New list --</option>');
    $('#id_list').on('change', function(){
      if ($(this).children("option#new-list-toggle:selected").length) {
        $('#id_list').hide();
        $('#new_list').css('display', 'inline-block');
        $('#id_new_list').focus();
      }
    });
  };
  
  Kippt.clearUI = function() {
    $("#id_title").val("");
    $("#id_notes").val("");
    $("#id_is_read_later").removeAttr("checked");
    $("#id_list").show();
    $("#new_list").hide();
    $('#id_new_list').val("");
    $('#id_private').removeAttr("checked");
  };
  
  Kippt.postClip = function(msg) {
    var type;
    if (!msg.id) {
      // Create new
      type = 'POST'
      url = 'https://kippt.com/api/clips/';
    } else {
      // Update
      type = 'PUT'
      url = 'https://kippt.com/api/clips/'+msg.id+'/'
    }

    var request = $.ajax({
      url: url,
      type: type,
      dataType: 'json',
      data: JSON.stringify(msg)
    })
    .done(function(){
      // Clear page cache
      Kippt.clearUI();
      localStorage.removeItem('cache-title');
      localStorage.removeItem('cache-notes');
    })
    .fail(function(jqXHR, textStatus){
      alert( "Something went wrong when saving. Try again or contact hello@kippt.com");
    });
  };

  Kippt.spinnerOptions = {
    lines: 9,
    length: 2,
    width: 2,
    radius: 3,
    rotate: 0,
    color: "#111",
    speed: 1,
    trail: 27,
    shadow: false,
    hwaccel: false,
    className: "spinner",
    zIndex: 2e9,
    top: "auto",
    left: "auto"
  };

  Kippt.spinner = new Spinner(Kippt.spinnerOptions).spin();

  Kippt.popoverHandler = function() {
    Kippt.existingClip = {};
    Kippt.updateExisting = false;

    $(".existing a").hide();
    $(".existing").show();
    $(".existing .loading").html($(Kippt.spinner.el).clone());

    var tab = safari.application.activeBrowserWindow.activeTab;
    Kippt.url = tab.url;

    // Open Kippt's Inbox if it's an empty page
    if (!tab.url) {
      tab.url = "https://kippt.com/inbox";
      Kippt.closePopover();
      return;
    }

    // Clear fields if not on the same page anymore
    if (tab.url !== Kippt.previousUrl) {
      $("#id_title").val(tab.title.trim());
      Kippt.updateExisting = false;
      Kippt.previousUrl = tab.url;
    }

    // Authentication check and connected services
    $.getJSON("https://kippt.com/api/account/?include_data=services&disable_basic_auth=1")
    .done(function(data) {
      Kippt.profilePath = data.app_url;

      $.each(data.services, function(name, connected) {
        if (connected) {
          $("#kippt-actions ." + name).toggleClass("connected", connected);
          $("#kippt-actions ." + name).css('display', 'inline-block');
        }
      });
    })
    .fail(function() {
      Kippt.openTab("https://kippt.com/login/");
    });

    // Check for existing clip
    $.getJSON("https://kippt.com/api/clips/?include_data=list&url=" + escape(tab.url))
    .done(function(data) {
      $(".existing .loading").html("");
      if (data.meta.total_count > 0) {
        Kippt.existingClip = data.objects[0];
        $(".existing a").css("display", "inline-block");
      }
    });

    // Populate lists from local storage
    var listCache = localStorage.getItem("kipptListCache");
    if (listCache) {
      Kippt.updateLists(JSON.parse(localStorage.getItem("kipptListCache")));
    }

    // Fetch latest lists
    $.getJSON("https://kippt.com/api/lists/?limit=0")
    .done(function(data) {
      var lists = data.objects,
          listJSON = JSON.stringify(lists);

      if (listJSON !== listCache) {
        Kippt.updateLists(lists);
        localStorage.setItem("kipptListCache", listJSON);
      }
    });
  };

  // Edit existing clip
  $(document).on("click", ".existing a", function(event) {
    event.preventDefault();
    Kippt.clearUI();
    Kippt.updateExisting = true;
    $("#id_title").val(Kippt.existingClip.title);
    $("#id_notes").val(Kippt.existingClip.notes);
    $("#id_list option[value="+Kippt.existingClip.list.id+"]").attr("selected", "selected");
    $(".existing").hide();
  });

  // Save clip
  $(document).on("click", "#submit_clip", function() {
    var services = $.map($(".share:checked"), function(element) {
      return $(element).data("service");
    });

    var data = {
      url: Kippt.url,
      title: $("#id_title").val(),
      notes: $("#id_notes").val(),
      list: $("#id_list option:selected").val(),
      source: "safari_v1.0",
      share: services
    };
    
    if (Kippt.updateExisting) {
      console.log('haz existing')
      data.id = Kippt.existingClip.id;
    }

    // New list
    if ($('#id_new_list').val()) {
      data['new_list'] = {};
      data['new_list']['title'] = $('#id_new_list').val()
      if ($('#id_private').is(':checked'))
        data['new_list'].is_private = true
      else
        data['new_list'].is_private = false
    }

    
    if (data['new_list']) {
      $.ajax({
        url: 'https://kippt.com/api/lists/',
        type: 'POST',
        dataType: 'json',
        data: JSON.stringify(data['new_list'])
      })
      .done(function(data){
        // Create clip with new list
        data['list'] = data.id;
        Kippt.postClip(data);
      })
      .fail(function(){
        alert( "Something went wrong when saving. Try again or contact hello@kippt.com");
      });
    } else {
      // Create clip with existing list
      Kippt.postClip(data);
    }
    
    Kippt.closePopover();
  });

  // Connect a service to share
  $(document).on("click", "#kippt-actions > div:not(.connected)", function() {
    Kippt.openTab("https://kippt.com/accounts/settings/connections/");
    Kippt.closePopover();
  });

  // Open profile page
  $(document).on("click", "#open-profile", function() {
    if (Kippt.profilePath !== undefined) {
      Kippt.openTab("https://kippt.com" + Kippt.profilePath);
    }
  });

  // Open inbox page
  $(document).on("click", "#open-inbox", function() {
    Kippt.openTab("https://kippt.com/inbox");
  });

  // Configure share tooltips
  $("#kippt-actions > div").tipsy({
    gravity: "sw",
    title: function() {
      var el = $(this);
      if (el.hasClass("connected")) {
        return "Share on " + el.attr("data-service-name");
      }
      else {
        return "Click to connect with " + el.attr("data-service-name");
      }
    }
  });

  safari.application.addEventListener("popover", Kippt.popoverHandler, true);
});
